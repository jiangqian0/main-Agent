from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import json
from pathlib import Path

router = APIRouter()
DATA_FILE = Path("app/data/resources.json")


class ResourceCreate(BaseModel):
    name: str
    type: str = "api_key"
    value: str = ""
    description: str = ""
    category: str = "General"


class ResourceUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    value: str | None = None
    description: str | None = None
    category: str | None = None


def _load():
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {"resources": []}
    return {"resources": []}


def _save(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("")
async def get_resources() -> Dict[str, List[Dict[str, Any]]]:
    data = _load()
    return {"resources": data.get("resources", [])}


@router.post("")
async def create_resource(r: ResourceCreate) -> Dict[str, Any]:
    data = _load()
    entry = {
        "id": f"res-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(data['resources']):03d}",
        "name": r.name,
        "type": r.type,
        "value": r.value,
        "description": r.description,
        "category": r.category,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    data["resources"].insert(0, entry)
    _save(data)
    return entry


@router.put("/{resource_id}")
async def update_resource(resource_id: str, r: ResourceUpdate) -> Dict[str, Any]:
    data = _load()
    for entry in data["resources"]:
        if entry["id"] == resource_id:
            if r.name is not None: entry["name"] = r.name
            if r.type is not None: entry["type"] = r.type
            if r.value is not None: entry["value"] = r.value
            if r.description is not None: entry["description"] = r.description
            if r.category is not None: entry["category"] = r.category
            entry["updated_at"] = datetime.now().isoformat()
            _save(data)
            return entry
    raise HTTPException(status_code=404, detail="Resource not found")


@router.delete("/{resource_id}")
async def delete_resource(resource_id: str):
    data = _load()
    before = len(data["resources"])
    data["resources"] = [r for r in data["resources"] if r["id"] != resource_id]
    if len(data["resources"]) == before:
        raise HTTPException(status_code=404, detail="Resource not found")
    _save(data)
    return {"message": "Deleted"}
