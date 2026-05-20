"""
Scheduled Tasks API — CRUD, execution trigger, history.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.service.scheduler_service import get_scheduler_service

router = APIRouter()


class TaskCreate(BaseModel):
    name: str
    description: str = ""
    prompt: str
    schedule_type: str = "once"  # once | daily | weekly
    schedule_value: str = ""       # HH:MM for daily | day name for weekly | ISO date for once
    enabled: bool = True
    model: str = "qwen3-max"
    mode: str = "ask"


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    schedule_type: Optional[str] = None
    schedule_value: Optional[str] = None
    enabled: Optional[bool] = None
    model: Optional[str] = None
    mode: Optional[str] = None


@router.get("")
async def list_tasks():
    """List all scheduled tasks."""
    service = get_scheduler_service()
    return {"tasks": service.get_all_tasks()}


@router.get("/{task_id}")
async def get_task(task_id: str):
    """Get a single task."""
    service = get_scheduler_service()
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("")
async def create_task(body: TaskCreate):
    """Create a new scheduled task."""
    service = get_scheduler_service()
    task = service.create_task(body.model_dump())
    return {"task": task}


@router.put("/{task_id}")
async def update_task(task_id: str, body: TaskUpdate):
    """Update a scheduled task."""
    service = get_scheduler_service()
    task = service.update_task(task_id, body.model_dump(exclude_none=True))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": task}


@router.delete("/{task_id}")
async def delete_task(task_id: str):
    """Delete a scheduled task."""
    service = get_scheduler_service()
    ok = service.delete_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}


@router.post("/{task_id}/toggle")
async def toggle_task(task_id: str):
    """Enable or disable a task."""
    service = get_scheduler_service()
    task = service.toggle_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": task}


@router.post("/{task_id}/run")
async def run_task_now(task_id: str):
    """Trigger immediate execution of a task."""
    service = get_scheduler_service()
    record = service.run_task_now(task_id)
    if not record:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"record": record}


@router.get("/history/all")
async def list_history(limit: int = 50):
    """Get execution history for all tasks."""
    service = get_scheduler_service()
    return {"history": service.get_history(limit)}


@router.get("/{task_id}/history")
async def get_task_history(task_id: str, limit: int = 20):
    """Get execution history for a specific task."""
    service = get_scheduler_service()
    return {"history": service.get_task_history(task_id, limit)}


@router.post("/reset-presets")
async def reset_presets():
    """Reset all tasks to default presets."""
    service = get_scheduler_service()
    tasks = service.reset_to_presets()
    return {"tasks": tasks}
