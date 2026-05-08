from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.service.memory_service import get_memory_service

router = APIRouter()


class MemoryCreate(BaseModel):
    content: str
    description: str = ""
    type: str = "knowledge"
    metadata: Optional[Dict[str, Any]] = None


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None


class MemoryConfigUpdate(BaseModel):
    token_threshold: Optional[int] = None
    extract_interval: Optional[int] = None


@router.get("")
async def get_memories() -> Dict[str, List[Dict[str, Any]]]:
    try:
        service = get_memory_service()
        return {"memories": service.get_all_memories()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_memories(query: str) -> Dict[str, List[Dict[str, Any]]]:
    try:
        service = get_memory_service()
        return {"memories": service.search_memories(query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{memory_id}")
async def get_memory(memory_id: str):
    try:
        service = get_memory_service()
        memory = service.get_memory(memory_id)
        if not memory:
            raise HTTPException(status_code=404, detail="Memory not found")
        return memory
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_memory(data: MemoryCreate):
    try:
        service = get_memory_service()
        memory = service.add_memory(
            content=data.content,
            description=data.description,
            memory_type=data.type,
            metadata=data.metadata,
        )
        return memory
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{memory_id}")
async def update_memory(memory_id: str, data: MemoryUpdate):
    try:
        service = get_memory_service()
        memory = service.update_memory(
            memory_id,
            content=data.content,
            description=data.description,
            memory_type=data.type,
        )
        if not memory:
            raise HTTPException(status_code=404, detail="Memory not found")
        return memory
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str):
    try:
        service = get_memory_service()
        deleted = service.delete_memory(memory_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"message": "Memory deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Config ────────────────────────────────────────────────────────


@router.get("/config")
async def get_memory_config() -> Dict[str, Any]:
    try:
        service = get_memory_service()
        return service.get_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def update_memory_config(data: MemoryConfigUpdate):
    try:
        service = get_memory_service()
        config = service.update_config(data.model_dump(exclude_none=True))
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
