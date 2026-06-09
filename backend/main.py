"""Constellation ingestion API — Phase 0.

POST /ingest { "repo_url": "<git url>" } -> { nodes, edges }
"""

import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from analyzer import CloneError, analyze_repo

app = FastAPI(title="Constellation — repo ingestion", version="0.1.0")

# The Vite dev server proxies /api -> here, but allow direct calls too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# https://, ssh://, or scp-style git@host:org/repo — no local paths, no flags.
_GIT_URL = re.compile(r"^(?:https?://|ssh://|git@)[\w][\w.@:/~+-]*$")


class IngestRequest(BaseModel):
    repo_url: str


class Node(BaseModel):
    id: str
    name: str
    dir: str
    loc: int
    language: str
    significance: float = Field(ge=0.0, le=1.0)


class Edge(BaseModel):
    source: str
    target: str
    type: str


class Graph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/ingest", response_model=Graph)
def ingest(req: IngestRequest) -> dict:
    url = req.repo_url.strip()
    if not _GIT_URL.match(url):
        raise HTTPException(
            status_code=422,
            detail="repo_url must be an https://, ssh://, or git@ Git URL",
        )
    try:
        return analyze_repo(url)
    except CloneError as exc:
        raise HTTPException(status_code=400, detail=f"clone failed: {exc}") from exc
