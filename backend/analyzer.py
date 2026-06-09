"""Repo ingestion pipeline: shallow clone -> walk -> import graph -> significance.

Output contract (consumed by the 3D constellation renderer):
    nodes: [{ id, name, dir, loc, language, significance }]
    edges: [{ source, target, type }]
"""

import math
import os
import posixpath
import shutil
import stat
import subprocess
import tempfile
from collections import Counter, defaultdict

import parsers
import semantics

# ---------------------------------------------------------------------------
# What counts as source
# ---------------------------------------------------------------------------

LANGUAGE_BY_EXT = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
    ".go": "go",
    ".java": "java",
    ".vue": "vue", ".svelte": "svelte",
    # Rendered as nodes (so polyglot repos still show their full shape) but not
    # yet parsed for edges — each is a future parser, not noise.
    ".rb": "ruby", ".rs": "rust", ".kt": "kotlin", ".swift": "swift", ".scala": "scala",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
    ".cs": "csharp", ".php": "php",
}

JS_FAMILY = {"javascript", "typescript", "vue", "svelte"}

IGNORE_DIRS = {
    "node_modules", "dist", "build", "out", "vendor", "target",
    "__pycache__", "venv", "env", "virtualenv", "site-packages",
    "coverage", "htmlcov", "migrations", "alembic", "__snapshots__", "testdata",
    "bin", "obj", "third_party",
}

IGNORE_FILE_SUFFIXES = (".min.js", ".min.css", ".d.ts", ".d.mts", ".d.cts")

MAX_FILE_BYTES = 1_000_000
# Files whose average line length exceeds this are bundles/generated output.
MAX_AVG_LINE_LEN = 400

CLONE_TIMEOUT_SECONDS = 180

# Files that mark a directory as a project/import root for each ecosystem.
PY_ROOT_MARKERS = {"pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "manage.py"}
JS_ROOT_MARKERS = {"package.json", "tsconfig.json", "jsconfig.json", "deno.json"}


class CloneError(Exception):
    pass


# ---------------------------------------------------------------------------
# Clone / cleanup
# ---------------------------------------------------------------------------

def _clone(repo_url: str, dest: str) -> None:
    cmd = [
        "git", "clone", "--depth", "1", "--single-branch", "--no-tags",
        "-c", "core.longpaths=true", "--", repo_url, dest,
    ]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, env=env, timeout=CLONE_TIMEOUT_SECONDS
        )
    except subprocess.TimeoutExpired as exc:
        raise CloneError(f"timed out after {CLONE_TIMEOUT_SECONDS}s") from exc
    except FileNotFoundError as exc:
        raise CloneError("git is not installed or not on PATH") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().splitlines()
        raise CloneError(detail[-1] if detail else f"git exited with {result.returncode}")


def _rmtree_force(path: str) -> None:
    """rmtree that survives Git's read-only object files on Windows."""

    def force(func, p, _exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass

    if not os.path.isdir(path):
        return
    try:
        shutil.rmtree(path, onexc=force)
    except TypeError:  # Python < 3.12
        shutil.rmtree(path, onerror=force)


# ---------------------------------------------------------------------------
# Walk
# ---------------------------------------------------------------------------

def _collect_sources(
    root: str,
) -> tuple[dict[str, str], dict[str, str], dict[str, int], set[str], set[str]]:
    """Walk the tree once: sources, languages, locs, and py/js project roots."""
    sources: dict[str, str] = {}
    languages: dict[str, str] = {}
    locs: dict[str, int] = {}
    py_roots: set[str] = set()
    js_roots: set[str] = set()

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d.lower() not in IGNORE_DIRS and not d.startswith(".")
        ]
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
        rel_dir = "" if rel_dir == "." else rel_dir
        for fn in filenames:
            if fn in PY_ROOT_MARKERS:
                py_roots.add(rel_dir)
            if fn in JS_ROOT_MARKERS:
                js_roots.add(rel_dir)
            if fn.startswith("."):
                continue
            lowered = fn.lower()
            ext = posixpath.splitext(lowered)[1]
            if ext not in LANGUAGE_BY_EXT or lowered.endswith(IGNORE_FILE_SUFFIXES):
                continue

            full = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(full) > MAX_FILE_BYTES:
                    continue
                with open(full, "rb") as fh:
                    raw = fh.read()
            except OSError:
                continue
            if b"\x00" in raw[:8192]:  # binary masquerading as source
                continue

            text = raw.decode("utf-8", errors="replace")
            loc = sum(1 for line in text.splitlines() if line.strip())
            if loc == 0 or len(text) / loc > MAX_AVG_LINE_LEN:
                continue  # empty, or minified/generated bundle

            rel = os.path.relpath(full, root).replace(os.sep, "/")
            sources[rel] = text
            languages[rel] = LANGUAGE_BY_EXT[ext]
            locs[rel] = loc

    return sources, languages, locs, py_roots, js_roots


# ---------------------------------------------------------------------------
# Edges
# ---------------------------------------------------------------------------

def _extract_edges(
    root: str,
    sources: dict[str, str],
    languages: dict[str, str],
    py_roots: set[str],
    js_roots: set[str],
) -> set[tuple[str, str]]:
    file_set = set(sources)
    all_files = sorted(file_set)

    py_files = [f for f in all_files if languages[f] == "python"]
    py_index = parsers.build_python_index(
        py_files, parsers.python_source_roots(py_files, py_roots)
    )

    go_files = [f for f in all_files if languages[f] == "go"]
    go_module = None
    if go_files:
        go_mod_path = os.path.join(root, "go.mod")
        if os.path.isfile(go_mod_path):
            with open(go_mod_path, "r", encoding="utf-8", errors="replace") as fh:
                go_module = parsers.parse_go_module(fh.read())
    go_dir_index = parsers.build_go_dir_index(go_files)

    java_sources = {f: sources[f] for f in all_files if languages[f] == "java"}
    java_fqn, java_pkg = parsers.build_java_index(java_sources)

    edges: set[tuple[str, str]] = set()
    for rel in all_files:
        lang = languages[rel]
        if lang == "python":
            targets = parsers.extract_python(rel, sources[rel], py_index)
        elif lang in JS_FAMILY:
            targets = parsers.extract_js(rel, sources[rel], file_set, js_roots)
        elif lang == "go":
            targets = parsers.extract_go(rel, sources[rel], go_module, go_dir_index)
        elif lang == "java":
            targets = parsers.extract_java(rel, sources[rel], java_fqn, java_pkg)
        else:
            continue
        edges.update((rel, t) for t in targets if t != rel)

    return edges


# ---------------------------------------------------------------------------
# Significance — "how load-bearing is this file?"
#
# Blend of two signals:
#   * PageRank over importer -> importee edges: rank flows toward the modules
#     everything ultimately depends on, and being imported by an important
#     file counts for more than being imported by a leaf.
#   * Log-scaled degree (in-degree weighted above out-degree) so well-connected
#     orchestrators still register even when they sit at the top of the graph.
# sqrt/log keep one mega-hub from flattening everyone else to zero — the
# constellation needs a brightness *gradient*, not one star and black dust.
# ---------------------------------------------------------------------------

def _pagerank(nodes: list[str], edges: set[tuple[str, str]], damping: float = 0.85,
              iterations: int = 40) -> dict[str, float]:
    n = len(nodes)
    adjacency: dict[str, list[str]] = defaultdict(list)
    for src, dst in edges:
        adjacency[src].append(dst)

    rank = {v: 1.0 / n for v in nodes}
    for _ in range(iterations):
        nxt = {v: (1.0 - damping) / n for v in nodes}
        dangling = 0.0
        for v in nodes:
            targets = adjacency.get(v)
            if targets:
                share = damping * rank[v] / len(targets)
                for t in targets:
                    nxt[t] += share
            else:
                dangling += rank[v]
        spread = damping * dangling / n
        for v in nodes:
            nxt[v] += spread
        rank = nxt
    return rank


def _significance(nodes: list[str], edges: set[tuple[str, str]]) -> dict[str, float]:
    if not edges:
        return {v: 0.1 for v in nodes}

    in_deg = Counter(t for _, t in edges)
    out_deg = Counter(s for s, _ in edges)
    rank = _pagerank(nodes, edges)

    r_min, r_max = min(rank.values()), max(rank.values())
    r_span = (r_max - r_min) or 1.0
    degree_score = {v: 1.6 * in_deg[v] + out_deg[v] for v in nodes}
    d_max = max(degree_score.values()) or 1.0

    result = {}
    for v in nodes:
        centrality = math.sqrt((rank[v] - r_min) / r_span)
        degree = math.log1p(degree_score[v]) / math.log1p(d_max)
        raw = 0.55 * centrality + 0.45 * degree
        result[v] = round(min(1.0, 0.04 + 0.96 * raw), 3)
    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def analyze_repo(repo_url: str) -> dict:
    tmp = tempfile.mkdtemp(prefix="constellation-")
    try:
        _clone(repo_url, tmp)
        return build_graph(tmp)
    finally:
        _rmtree_force(tmp)


def build_graph(root: str) -> dict:
    sources, languages, locs, py_roots, js_roots = _collect_sources(root)
    edges = _extract_edges(root, sources, languages, py_roots, js_roots)
    significance = _significance(sorted(sources), edges)
    extras, clusters = semantics.enrich(sources, languages, edges, significance)

    nodes = [
        {
            "id": rel,
            "name": posixpath.basename(rel),
            "dir": posixpath.dirname(rel),
            "loc": locs[rel],
            "language": languages[rel],
            "significance": significance[rel],
            "role": extras[rel]["role"],
            "description": extras[rel]["description"],
        }
        for rel in sorted(sources)
    ]
    edge_list = [
        {"source": src, "target": dst, "type": "import"}
        for src, dst in sorted(edges)
    ]
    return {"nodes": nodes, "edges": edge_list, "clusters": clusters}
