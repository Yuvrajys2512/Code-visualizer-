"""Per-language import extraction and resolution.

Every path in and out of this module is a repo-relative POSIX string
("backend/app/main.py"). Resolvers only return targets that exist inside the
repo; anything that doesn't resolve to a repo file (stdlib, npm packages,
third-party Go modules, JDK classes) is silently dropped — external noise has
no place in the constellation.
"""

import ast
import posixpath
import re
from collections import defaultdict


def _norm(base_dir: str, spec: str) -> str | None:
    """Resolve a relative specifier against a directory, staying inside the repo."""
    joined = posixpath.normpath(posixpath.join(base_dir, spec))
    if joined.startswith(".."):
        return None
    return "" if joined == "." else joined  # "" == repo root, e.g. require('../')


# --------------------------------------------------------------------------
# Python — real AST parsing, source-root-aware module index
# --------------------------------------------------------------------------

def python_source_roots(py_files: list[str], marker_dirs: set[str]) -> set[str]:
    """Import roots: repo root, any dir holding a project marker (pyproject.toml
    etc., discovered during the walk), and any dir named src — so layouts like
    backend/app/... with `from app.core import x` resolve correctly."""
    roots = {""} | marker_dirs
    for rel in py_files:
        parts = rel.split("/")
        for i, part in enumerate(parts[:-1]):
            if part == "src":
                roots.add("/".join(parts[: i + 1]))
    return roots


def build_python_index(py_files: list[str], roots: set[str]) -> dict[str, str]:
    """Map dotted module names ("app.core.config") to repo file paths."""
    index: dict[str, str] = {}
    # Deepest roots first so the most specific dotted name claims a slot first.
    for root in sorted(roots, key=len, reverse=True):
        for rel in py_files:
            if root and not rel.startswith(root + "/"):
                continue
            sub = rel[len(root) + 1 :] if root else rel
            parts = sub[: -len(".py")].split("/")
            if parts[-1] == "__init__":
                parts = parts[:-1]
            if parts:
                index.setdefault(".".join(parts), rel)
    return index


def extract_python(rel_path: str, source: str, module_index: dict[str, str]) -> set[str]:
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return set()

    targets: set[str] = set()
    dir_parts = rel_path.split("/")[:-1]

    def hit(parts: list[str]) -> bool:
        found = module_index.get(".".join(parts))
        if found and found != rel_path:
            targets.add(found)
            return True
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                hit(alias.name.split("."))
        elif isinstance(node, ast.ImportFrom):
            if node.level:  # relative import
                up = node.level - 1
                if up > len(dir_parts):
                    continue
                base = dir_parts[: len(dir_parts) - up]
            else:
                base = []
            base = base + (node.module.split(".") if node.module else [])
            if not base:
                continue
            for alias in node.names:
                # `from a.b import c` — c may be a module or just a symbol.
                if not hit(base + [alias.name]):
                    hit(base)

    return targets


# --------------------------------------------------------------------------
# JavaScript / TypeScript (also .vue / .svelte script blocks)
# --------------------------------------------------------------------------

_JS_PATTERNS = [
    re.compile(r"""\bimport\s+(?:type\s+)?[\w*\s{},$]*?\bfrom\s*["']([^"'\n]+)["']"""),
    re.compile(r"""\bexport\s+(?:type\s+)?[\w*\s{},$]*?\bfrom\s*["']([^"'\n]+)["']"""),
    re.compile(r"""\bimport\s*["']([^"'\n]+)["']"""),  # side-effect import
    re.compile(r"""\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)"""),
    re.compile(r"""\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)"""),  # dynamic import
]

_JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte")


def _resolve_js_spec(
    spec: str, importer: str, file_set: set[str], js_roots: set[str]
) -> str | None:
    spec = spec.split("?", 1)[0].rstrip("/")
    if not spec:
        return None

    bases: list[str] = []
    if spec.startswith("."):
        base = _norm(posixpath.dirname(importer), spec)
        if base is not None:
            bases.append(base)
    elif spec.startswith(("@/", "~/")):
        # The two near-universal aliases. They are defined per-project, so in a
        # monorepo they resolve against the importer's nearest project root
        # (dir with package.json/tsconfig), not the repo root.
        rest = spec[2:]
        for root in _ancestor_roots(importer, js_roots):
            prefix = root + "/" if root else ""
            bases += [prefix + "src/" + rest, prefix + rest, prefix + "app/" + rest,
                      prefix + "lib/" + rest]
    elif spec.startswith("/"):
        bases.append(spec.lstrip("/"))
    else:
        return None  # bare specifier -> external package

    for base in bases:
        stems = [base]
        # TS ESM style: `import './x.js'` actually means x.ts on disk.
        if base.endswith((".js", ".jsx", ".mjs", ".cjs")):
            stems.append(base.rsplit(".", 1)[0])
        for stem in stems:
            if stem:
                if stem in file_set:
                    return stem
                for ext in _JS_EXTS:
                    if stem + ext in file_set:
                        return stem + ext
            for ext in _JS_EXTS:
                cand = stem + "/index" + ext if stem else "index" + ext
                if cand in file_set:
                    return cand
    return None


def _ancestor_roots(importer: str, js_roots: set[str]) -> list[str]:
    """Project roots that contain the importer, deepest first, repo root last."""
    hits = []
    d = posixpath.dirname(importer)
    while d:
        if d in js_roots:
            hits.append(d)
        d = posixpath.dirname(d)
    hits.append("")
    return hits


def extract_js(
    rel_path: str, source: str, file_set: set[str], js_roots: set[str]
) -> set[str]:
    targets = set()
    for pattern in _JS_PATTERNS:
        for spec in pattern.findall(source):
            resolved = _resolve_js_spec(spec, rel_path, file_set, js_roots)
            if resolved and resolved != rel_path:
                targets.add(resolved)
    return targets


# --------------------------------------------------------------------------
# Go — resolve module-path imports to package directories via go.mod
# --------------------------------------------------------------------------

_GO_BLOCK = re.compile(r"^\s*import\s*\((.*?)\)", re.M | re.S)
_GO_SINGLE = re.compile(r'^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"', re.M)
_GO_QUOTED = re.compile(r'"([^"]+)"')


def parse_go_module(go_mod_text: str) -> str | None:
    m = re.search(r"^module\s+(\S+)", go_mod_text, re.M)
    return m.group(1) if m else None


def build_go_dir_index(go_files: list[str]) -> dict[str, list[str]]:
    """Package dir -> its compiled .go files (tests excluded as import targets)."""
    index: dict[str, list[str]] = defaultdict(list)
    for rel in go_files:
        if not rel.endswith("_test.go"):
            index[posixpath.dirname(rel)].append(rel)
    return index


def extract_go(
    rel_path: str, source: str, module_name: str | None, go_dir_index: dict[str, list[str]]
) -> set[str]:
    if not module_name:
        return set()
    specs: set[str] = set(_GO_SINGLE.findall(source))
    for block in _GO_BLOCK.findall(source):
        specs.update(_GO_QUOTED.findall(block))

    targets: set[str] = set()
    for spec in specs:
        if spec == module_name:
            pkg_dir = ""
        elif spec.startswith(module_name + "/"):
            pkg_dir = spec[len(module_name) + 1 :]
        else:
            continue  # external module
        # Importing a Go package depends on every file that compiles into it.
        for f in go_dir_index.get(pkg_dir, []):
            if f != rel_path:
                targets.add(f)
    return targets


# --------------------------------------------------------------------------
# Java — fully-qualified class index built from `package` declarations
# --------------------------------------------------------------------------

_JAVA_PKG = re.compile(r"^\s*package\s+([\w.]+)\s*;", re.M)
_JAVA_IMP = re.compile(r"^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;", re.M)


def build_java_index(java_sources: dict[str, str]) -> tuple[dict[str, str], dict[str, list[str]]]:
    fqn_index: dict[str, str] = {}
    pkg_index: dict[str, list[str]] = defaultdict(list)
    for rel, source in java_sources.items():
        cls = posixpath.basename(rel)[: -len(".java")]
        m = _JAVA_PKG.search(source)
        pkg = m.group(1) if m else ""
        fqn = f"{pkg}.{cls}" if pkg else cls
        fqn_index.setdefault(fqn, rel)
        pkg_index[pkg].append(rel)
    return fqn_index, pkg_index


def extract_java(
    rel_path: str,
    source: str,
    fqn_index: dict[str, str],
    pkg_index: dict[str, list[str]],
) -> set[str]:
    targets: set[str] = set()
    for name in _JAVA_IMP.findall(source):
        if name.endswith(".*"):
            base = name[:-2]
            if base in pkg_index:
                targets.update(f for f in pkg_index[base] if f != rel_path)
            elif base in fqn_index:  # static wildcard: import static a.b.C.*
                targets.add(fqn_index[base])
        else:
            found = fqn_index.get(name)
            if not found and "." in name:
                # static member (a.b.C.method) or inner class (a.b.Outer.Inner)
                found = fqn_index.get(name.rsplit(".", 1)[0])
            if found and found != rel_path:
                targets.add(found)
    return targets
