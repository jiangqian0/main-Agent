from fastapi import APIRouter, HTTPException
from typing import Optional
from app.core.schemas import ChatRequest
from app.service.agent_service import AgentService

router = APIRouter()


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """流式聊天接口"""
    try:
        agent = AgentService()
        return await agent.stream_response(
            message=request.message,
            conversation_id=request.conversation_id,
            skill_id=request.skill_id,
            enable_tools=request.enable_tools,
            model=request.model,
            knowledge_bases=request.knowledge_bases,
            mode=request.mode or "agent",
            plan_confirmed=request.plan_confirmed or False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def chat(request: ChatRequest):
    """非流式聊天接口"""
    try:
        agent = AgentService()
        return await agent.get_response(
            message=request.message,
            conversation_id=request.conversation_id,
            skill_id=request.skill_id,
            enable_tools=request.enable_tools,
            model=request.model,
            knowledge_bases=request.knowledge_bases,
            mode=request.mode or "agent",
            plan_confirmed=request.plan_confirmed or False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
