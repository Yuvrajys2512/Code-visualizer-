"""Git history mining: when was each star born, and how hot does it still burn?

Reads `git log --name-status` straight off the clone — commit and tree
objects only, so it works on a blob-less partial clone without triggering
any lazy blob fetches. Produces, per file still present at HEAD:

    born   unix time of the commit that first introduced the file
    edits  downsampled unix times of commits that touched it since
    heat   0..1 recency-weighted churn (1 = actively burning, 0 = cold)

plus a global span so the renderer can scrub time. Files deleted before
HEAD have no position in the sky, so they are simply not reported.
"""

import math
import re
import subprocess
import time

LOG_TIMEOUT_SECONDS = 120
MAX_EDITS_PER_FILE = 40
# e-folding time for churn heat: an edit 90 days ago counts ~1/e of one today.
HEAT_HALFLIFE_DAYS = 90.0

_COMMIT_MARK = "\x01"
_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\"}


def _unquote(path: str) -> str:
    """Undo git's C-style quoting of unusual paths ("a\\tb", octal escapes)."""
    if not (path.startswith('"') and path.endswith('"')):
        return path
    out: list[str] = []
    body = path[1:-1]
    i = 0
    while i < len(body):
        ch = body[i]
        if ch != "\\":
            out.append(ch)
            i += 1
        elif re.fullmatch(r"[0-7]{3}", body[i + 1 : i + 4]):
            out.append(chr(int(body[i + 1 : i + 4], 8)))
            i += 4
        else:
            out.append(_ESCAPES.get(body[i + 1 : i + 2], body[i + 1 : i + 2]))
            i += 2
    return "".join(out)


def _git_log(root: str) -> str:
    cmd = [
        "git", "-C", root, "log",
        "--reverse", "--date-order", "--no-renames", "--name-status",
        f"--format={_COMMIT_MARK}%ct",
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=LOG_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git log failed")
    return result.stdout


def _downsample(values: list[int], cap: int) -> list[int]:
    if len(values) <= cap:
        return values
    step = (len(values) - 1) / (cap - 1)
    return [values[round(i * step)] for i in range(cap)]


def mine_history(root: str, wanted: set[str]) -> tuple[dict[str, dict], dict]:
    """Per-file {born, edits, heat} for `wanted` paths, plus global span.

    Returns ({}, {}) when history is unavailable (not a git repo, timeout,
    grafted single-commit clone…) — the graph stays fully usable without it.
    """
    try:
        raw = _git_log(root)
    except (OSError, subprocess.TimeoutExpired, RuntimeError):
        return {}, {}

    touches: dict[str, list[int]] = {}
    first_ts = 0
    last_ts = 0
    commit_count = 0
    ts = 0

    for line in raw.splitlines():
        if not line:
            continue
        if line.startswith(_COMMIT_MARK):
            try:
                ts = int(line[1:].strip())
            except ValueError:
                continue
            commit_count += 1
            if not first_ts:
                first_ts = ts
            last_ts = max(last_ts, ts)
            continue
        status, _, path = line.partition("\t")
        if not path or status[:1] not in ("A", "M", "T"):
            continue
        path = _unquote(path.strip())
        if path not in wanted:
            continue
        touches.setdefault(path, []).append(ts)

    if commit_count < 2 or not touches:
        return {}, {}

    now = time.time()
    decay = HEAT_HALFLIFE_DAYS * 86400.0
    raw_heat = {
        path: sum(math.exp(-max(0.0, now - t) / decay) for t in stamps)
        for path, stamps in touches.items()
    }
    max_heat = max(raw_heat.values()) or 1.0

    per_file = {
        path: {
            "born": stamps[0],
            "edits": _downsample(stamps, MAX_EDITS_PER_FILE),
            "heat": round(math.log1p(raw_heat[path]) / math.log1p(max_heat), 3),
        }
        for path, stamps in touches.items()
    }
    span = {"start": first_ts, "end": last_ts, "commits": commit_count}
    return per_file, span
