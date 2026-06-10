"""Bake famous repositories into bundled gallery graphs.

Run once (network + git required):  python bake_gallery.py
Writes frontend/public/gallery/<name>.json plus an index.json manifest, so
the deployed frontend can show off instantly with no backend at all.
"""

import json
import os
import sys

from analyzer import analyze_repo

GALLERY = [
    {
        "name": "flask",
        "repo": "https://github.com/pallets/flask",
        "blurb": "Pallets' micro web framework — 15 years of history",
    },
    {
        "name": "express",
        "repo": "https://github.com/expressjs/express",
        "blurb": "the Node.js web framework that started it all",
    },
    {
        "name": "httpx",
        "repo": "https://github.com/encode/httpx",
        "blurb": "modern async HTTP client for Python",
    },
    {
        "name": "vue core",
        "repo": "https://github.com/vuejs/core",
        "blurb": "Vue 3's reactivity engine and compiler",
    },
]

OUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "gallery")
)


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    index = []
    for entry in GALLERY:
        slug = entry["name"].replace(" ", "-")
        print(f"baking {entry['repo']} …", flush=True)
        try:
            graph = analyze_repo(entry["repo"])
        except Exception as exc:  # keep baking the rest
            print(f"  FAILED: {exc}", file=sys.stderr)
            continue
        filename = f"{slug}.json"
        with open(os.path.join(OUT_DIR, filename), "w", encoding="utf-8") as fh:
            json.dump(graph, fh, separators=(",", ":"))
        span = graph.get("history") or {}
        print(
            f"  {len(graph['nodes'])} files, {len(graph['edges'])} imports,"
            f" {span.get('commits', 0)} commits"
        )
        index.append({**entry, "file": filename})

    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=1)
    print(f"gallery: {len(index)} skies -> {OUT_DIR}")
    return 0 if index else 1


if __name__ == "__main__":
    raise SystemExit(main())
