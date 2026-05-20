# GitHub Sync API
# Add to app/api/github_api.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import httpx
import base64
import os

router = APIRouter(prefix="/api/github", tags=["GitHub"])


class SyncRequest(BaseModel):
    files: List[dict]  # [{path: str, content: str}]
    message: str = ""
    branch: str = "main"
    repo: Optional[str] = None
    token: Optional[str] = None


@router.post("/sync")
async def sync_to_github(req: SyncRequest):
    """
    Sync workspace files to GitHub.
    Files are sent as {path, content} objects.
    """
    token = req.token
    repo = req.repo

    if not token or not repo:
        raise HTTPException(status_code=400, detail="Token and repo are required")

    # Parse repo
    parts = repo.split("/")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Repo format: owner/repo")
    owner, repo_name = parts[0], parts[1]

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    results = []

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        for file_info in req.files:
            file_path = file_info["path"]
            content = file_info["content"]
            commit_msg = req.message or f"chore: sync {file_path}"

            encoded_path = file_path.replace("/", "%2F")

            # Check if file exists to get SHA
            sha = None
            try:
                ref_resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo_name}/contents/{encoded_path}",
                    headers=headers,
                    params={"ref": req.branch},
                )
                if ref_resp.status_code == 200:
                    sha = ref_resp.json().get("sha")
            except Exception:
                pass

            # Create/update file
            content_base64 = base64.b64encode(content.encode("utf-8")).decode("ascii")

            payload = {
                "message": commit_msg,
                "content": content_base64,
                "branch": req.branch,
            }
            if sha:
                payload["sha"] = sha

            try:
                resp = await client.put(
                    f"https://api.github.com/repos/{owner}/{repo_name}/contents/{encoded_path}",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    results.append({
                        "path": file_path,
                        "status": "success",
                        "commit_url": data.get("commit", {}).get("html_url"),
                    })
                else:
                    err = resp.json() if resp.text else {}
                    results.append({
                        "path": file_path,
                        "status": "error",
                        "error": err.get("message", f"HTTP {resp.status_code}"),
                    })
            except Exception as e:
                results.append({"path": file_path, "status": "error", "error": str(e)})

    success_count = sum(1 for r in results if r["status"] == "success")
    return {
        "success": success_count == len(results),
        "synced": success_count,
        "total": len(results),
        "results": results,
    }


@router.get("/branches")
async def list_branches(token: str, repo: str):
    """List branches for a repository."""
    parts = repo.split("/")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Repo format: owner/repo")
    owner, repo_name = parts[0], parts[1]

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo_name}/branches",
            headers=headers,
            params={"per_page": 100},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    branches = [b["name"] for b in resp.json()]
    return {"branches": branches}


@router.get("/user")
async def get_github_user(token: str):
    """Get GitHub user info."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        resp = await client.get("https://api.github.com/user", headers=headers)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    return {"login": data.get("login"), "name": data.get("name"), "avatar_url": data.get("avatar_url")}
