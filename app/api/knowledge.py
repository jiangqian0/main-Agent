from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.service.knowledge_service import get_knowledge_base_service

router = APIRouter()


class KBCreate(BaseModel):
    title: str
    content: str
    category: str = "General"
    tags: Optional[List[str]] = None


class KBUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("")
async def get_all_entries() -> Dict[str, List[Dict[str, Any]]]:
    try:
        service = get_knowledge_base_service()
        return {"entries": service.get_all()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_categories() -> Dict[str, List[str]]:
    try:
        service = get_knowledge_base_service()
        return {"categories": service.get_categories()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_entries(query: str) -> Dict[str, List[Dict[str, Any]]]:
    try:
        service = get_knowledge_base_service()
        return {"entries": service.search(query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch")
async def get_batch(ids: str) -> Dict[str, List[Dict[str, Any]]]:
    try:
        service = get_knowledge_base_service()
        id_list = [x.strip() for x in ids.split(",") if x.strip()]
        return {"entries": service.get_by_ids(id_list)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{kb_id}")
async def get_entry(kb_id: str):
    try:
        service = get_knowledge_base_service()
        entry = service.get(kb_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_entry(data: KBCreate):
    try:
        service = get_knowledge_base_service()
        entry = service.create(
            title=data.title,
            content=data.content,
            category=data.category,
            tags=data.tags,
        )
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{kb_id}")
async def update_entry(kb_id: str, data: KBUpdate):
    try:
        service = get_knowledge_base_service()
        entry = service.update(
            kb_id,
            title=data.title,
            content=data.content,
            category=data.category,
            tags=data.tags,
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{kb_id}")
async def delete_entry(kb_id: str):
    try:
        service = get_knowledge_base_service()
        deleted = service.delete(kb_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        return {"message": "Entry deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
