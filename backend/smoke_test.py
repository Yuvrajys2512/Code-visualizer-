"""Quick graph-quality check: python smoke_test.py <git-url>

Prints the stats that matter for the constellation: how connected the graph
is, whether significance has a real gradient, and which files it crowns as
load-bearers (eyeball those — they should read like the repo's architecture).
"""

import json
import os
import sys
from collections import Counter

from analyzer import analyze_repo, build_graph


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else "https://github.com/fastapi/full-stack-fastapi-template"
    print(f"ingesting {url} ...")
    graph = build_graph(url) if os.path.isdir(url) else analyze_repo(url)
    nodes, edges = graph["nodes"], graph["edges"]

    by_id = {n["id"]: n for n in nodes}
    linked = {e["source"] for e in edges} | {e["target"] for e in edges}
    print(f"\n{len(nodes)} nodes, {len(edges)} edges, "
          f"{len(nodes) - len(linked)} isolated nodes")
    print("languages:", dict(Counter(n["language"] for n in nodes)))

    sigs = sorted((n["significance"] for n in nodes), reverse=True)
    print(f"significance: max={sigs[0]:.3f} median={sigs[len(sigs) // 2]:.3f} min={sigs[-1]:.3f}")

    in_deg = Counter(e["target"] for e in edges)
    print("\ntop 12 by significance (in-degree shown):")
    for n in sorted(nodes, key=lambda n: -n["significance"])[:12]:
        print(f"  {n['significance']:.3f}  <-{in_deg[n['id']]:>3}  {n['id']}")

    print("\nclusters:")
    for c in graph.get("clusters", []):
        print(f"  [{c['label']}] {c['description']}")

    print("\nsample file semantics:")
    for n in sorted(nodes, key=lambda n: -n["significance"])[:6]:
        print(f"  {n['id']}  ({n['role']})")
        if n["description"]:
            print(f"      {n['description']}")

    with open("graph.json", "w", encoding="utf-8") as fh:
        json.dump(graph, fh, indent=2)
    print("\nfull graph written to graph.json")


if __name__ == "__main__":
    main()
