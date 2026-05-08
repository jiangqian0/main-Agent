from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import json
from pathlib import Path

router = APIRouter()
DATA_FILE = Path("app/data/agents.json")
DATA_FILE.parent.mkdir(parents=True, exist_ok=True)


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    type: str = "assistant"
    skills: List[str] = []
    system_prompt: str = ""
    model: str = ""


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: str | None = None
    skills: List[str] | None = None
    system_prompt: str | None = None
    model: str | None = None
    enabled: bool | None = None


def _load():
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"agents": _builtin_agents()}


def _builtin_agents() -> List[Dict[str, Any]]:
    now = datetime.now().isoformat()
    return [
        {
            "id": "builtin-code-agent",
            "name": "Code Development Agent",
            "description": "Specialized in writing, reviewing, and debugging code across multiple languages.",
            "type": "assistant",
            "skills": ["builtin-code-dev"],
            "system_prompt": "You are a code development specialist focused on clean, maintainable code.",
            "model": "qwen3-max",
            "enabled": True,
            "is_builtin": True,
            "created_at": now,
        },
        {
            "id": "builtin-devops-agent",
            "name": "DevOps Agent",
            "description": "Handles deployment, CI/CD pipelines, Docker, and server management.",
            "type": "assistant",
            "skills": ["builtin-terminal-master"],
            "system_prompt": "You are a DevOps and infrastructure specialist.",
            "model": "qwen3-max",
            "enabled": False,
            "is_builtin": True,
            "created_at": now,
        },
        {
            "id": "builtin-security-agent",
            "name": "Security Agent",
            "description": "Monitors code for security vulnerabilities and compliance issues.",
            "type": "security",
            "skills": ["builtin-code-review"],
            "system_prompt": "You are a security expert focused on vulnerability detection.",
            "model": "qwen3-max",
            "enabled": False,
            "is_builtin": True,
            "created_at": now,
        },
        {
            "id": "builtin-quickfix-agent",
            "name": "Quick Fix Agent",
            "description": "Fast bug diagnosis and targeted fixes with minimal changes.",
            "type": "assistant",
            "skills": ["builtin-quick-fix"],
            "system_prompt": "You are a quick-fix specialist focused on minimal, targeted changes.",
            "model": "qwen3-max",
            "enabled": False,
            "is_builtin": True,
            "created_at": now,
        },
    ]


def _save(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("")
async def get_agents() -> Dict[str, List[Dict[str, Any]]]:
    return _load()


@router.post("")
async def create_agent(a: AgentCreate) -> Dict[str, Any]:
    data = _load()
    now = datetime.now().isoformat()
    entry = {
        "id": f"agent-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(data['agents']):03d}",
        "name": a.name,
        "description": a.description,
        "type": a.type,
        "skills": a.skills,
        "system_prompt": a.system_prompt,
        "model": a.model,
        "enabled": True,
        "is_builtin": False,
        "created_at": now,
        "updated_at": now,
    }
    data["agents"].insert(0, entry)
    _save(data)
    return entry


@router.put("/{agent_id}")
async def update_agent(agent_id: str, a: AgentUpdate):
    data = _load()
    for entry in data["agents"]:
        if entry["id"] == agent_id:
            if a.name is not None: entry["name"] = a.name
            if a.description is not None: entry["description"] = a.description
            if a.type is not None: entry["type"] = a.type
            if a.skills is not None: entry["skills"] = a.skills
            if a.system_prompt is not None: entry["system_prompt"] = a.system_prompt
            if a.model is not None: entry["model"] = a.model
            if a.enabled is not None: entry["enabled"] = a.enabled
            entry["updated_at"] = datetime.now().isoformat()
            _save(data)
            return entry
    raise HTTPException(status_code=404, detail="Agent not found")


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    data = _load()
    for i, a in enumerate(data["agents"]):
        if a["id"] == agent_id:
            if a.get("is_builtin"):
                raise HTTPException(status_code=400, detail="Cannot delete built-in agents")
            del data["agents"][i]
            _save(data)
            return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/{agent_id}/toggle")
async def toggle_agent(agent_id: str):
    data = _load()
    for entry in data["agents"]:
        if entry["id"] == agent_id:
            entry["enabled"] = not entry["enabled"]
            entry["updated_at"] = datetime.now().isoformat()
            _save(data)
            return entry
    raise HTTPException(status_code=404, detail="Agent not found")
