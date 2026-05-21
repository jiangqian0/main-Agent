from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from app.core.schemas import Skill, SkillCreate, SkillUpdate
from app.service.skill_service import get_skill_service

router = APIRouter()


@router.get("/", response_model=List[Skill])
async def get_skills():
    """获取所有技能列表"""
    try:
        service = get_skill_service()
        return service.get_all_skills()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-category")
async def get_skills_by_category() -> Dict[str, List[Dict[str, Any]]]:
    """按分类获取技能列表"""
    try:
        service = get_skill_service()
        raw = service.get_skills_by_category()
        return {cat: [s.model_dump() for s in skills] for cat, skills in raw.items()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tools")
async def get_builtin_tools() -> List[Dict[str, Any]]:
    """获取内置工具定义列表"""
    try:
        service = get_skill_service()
        return service.get_builtin_tools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/match")
async def match_skill(message: str) -> Optional[Dict[str, Any]]:
    """
    根据消息内容智能匹配最合适的 Skill。
    前端可以在用户发送消息前调用此接口预览匹配结果。
    """
    try:
        service = get_skill_service()
        skill = service.match_skill_by_message(message)
        return skill.model_dump() if skill else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{skill_id}", response_model=Skill)
async def get_skill(skill_id: str):
    """获取单个技能"""
    try:
        service = get_skill_service()
        skill = service.get_skill(skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        return skill
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_skill(skill_data: SkillCreate):
    """创建新技能"""
    try:
        service = get_skill_service()
        skill = service.create_skill(skill_data)
        return skill
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{skill_id}/toggle")
async def toggle_skill(skill_id: str):
    """切换技能启用状态"""
    try:
        service = get_skill_service()
        skill = service.toggle_skill(skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        return skill
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{skill_id}")
async def update_skill(skill_id: str, skill: SkillUpdate):
    """更新技能"""
    try:
        service = get_skill_service()
        updated = service.update_skill(skill_id, skill)
        if not updated:
            raise HTTPException(status_code=404, detail="Skill not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """删除技能（内置技能不可删除）"""
    try:
        service = get_skill_service()
        deleted = service.delete_skill(skill_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Skill not found or is a builtin skill")
        return {"message": "Skill deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))