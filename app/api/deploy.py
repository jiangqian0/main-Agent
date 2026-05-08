from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import json
from pathlib import Path

router = APIRouter()
DATA_DIR = Path("app/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)


class ResourceCreate(BaseModel):
    name: str
    type: str = "variable"
    value: str = ""
    description: str = ""
    category: str = "General"


class ResourceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    value: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


RESOURCES_FILE = DATA_DIR / "resources.json"
LOGS_FILE = DATA_DIR / "deploy_logs.json"


def _load_resources():
    if RESOURCES_FILE.exists():
        try:
            with open(RESOURCES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"resources": []}


def _save_resources(data):
    with open(RESOURCES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("/resources")
async def get_resources() -> Dict[str, List[Dict[str, Any]]]:
    return _load_resources()


@router.post("/resources")
async def create_resource(r: ResourceCreate) -> Dict[str, Any]:
    data = _load_resources()
    entry = {
        "id": f"res-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "name": r.name,
        "type": r.type,
        "value": r.value,
        "description": r.description,
        "category": r.category,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    data["resources"].insert(0, entry)
    _save_resources(data)
    return entry


@router.put("/resources/{resource_id}")
async def update_resource(resource_id: str, r: ResourceUpdate):
    data = _load_resources()
    for entry in data["resources"]:
        if entry["id"] == resource_id:
            if r.name is not None: entry["name"] = r.name
            if r.type is not None: entry["type"] = r.type
            if r.value is not None: entry["value"] = r.value
            if r.description is not None: entry["description"] = r.description
            if r.category is not None: entry["category"] = r.category
            entry["updated_at"] = datetime.now().isoformat()
            _save_resources(data)
            return entry
    raise HTTPException(status_code=404, detail="Resource not found")


@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str):
    data = _load_resources()
    before = len(data["resources"])
    data["resources"] = [r for r in data["resources"] if r["id"] != resource_id]
    if len(data["resources"]) == before:
        raise HTTPException(status_code=404, detail="Resource not found")
    _save_resources(data)
    return {"message": "Deleted"}


# ── Deploy Logs ────────────────────────────────────────────

class DeployLogCreate(BaseModel):
    project: str
    environment: str
    status: str
    message: str = ""


def _load_logs():
    if LOGS_FILE.exists():
        try:
            with open(LOGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"logs": []}


def _save_logs(data):
    with open(LOGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("/deploy/logs")
async def get_deploy_logs() -> Dict[str, List[Dict[str, Any]]]:
    return _load_logs()


@router.post("/deploy/logs")
async def create_deploy_log(log: DeployLogCreate) -> Dict[str, Any]:
    data = _load_logs()
    entry = {
        "id": f"log-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "project": log.project,
        "environment": log.environment,
        "status": log.status,
        "message": log.message,
        "created_at": datetime.now().isoformat(),
    }
    data["logs"].insert(0, entry)
    # Keep only last 100 logs
    data["logs"] = data["logs"][:100]
    _save_logs(data)
    return entry


@router.delete("/deploy/logs/{log_id}")
async def delete_deploy_log(log_id: str):
    data = _load_logs()
    before = len(data["logs"])
    data["logs"] = [l for l in data["logs"] if l["id"] != log_id]
    if len(data["logs"]) == before:
        raise HTTPException(status_code=404, detail="Log not found")
    _save_logs(data)
    return {"message": "Deleted"}
