from typing import Dict, Any, Optional
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
import json
from app.agent.loop import AgentLoop
from app.service.skill_service import get_skill_service
from app.service.knowledge_service import get_knowledge_base_service
from app.service.config_service import get_config_service


SYSTEM_PROMPT = """你是一个智能 AI 助手，擅长代码开发、问题解答和任务处理。
你可以使用工具来读取、编写和编辑文件，以及执行命令来完成任务。
当你需要写代码时，请使用 Write 工具创建文件。
当需要查看现有代码时，使用 Read 工具。
当需要修改文件时，使用 Edit 工具。
当需要执行命令时，使用 Bash 工具。
请始终以用户友好且专业的方式回复。"""


class AgentService:
    def __init__(self):
        cfg = get_config_service()
        self.default_api_key = cfg.get("api_key") or ""
        self.default_base_url = cfg.get("api_base_url", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        self.default_model = cfg.get("model", "qwen3-max")

    def _get_llm_provider(self, model: str) -> str:
        return "openai-compatible"

    async def stream_response(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        skill_id: Optional[str] = None,
        enable_tools: bool = True,
        model: Optional[str] = None,
        knowledge_bases: Optional[list] = None,
    ):
        skill_service = get_skill_service()
        skill_system_prompt, allowed_tools = skill_service.get_skill_system_prompt(skill_id)

        kb_context = ""
        if knowledge_bases:
            kb_service = get_knowledge_base_service()
            entries = kb_service.get_by_ids(knowledge_bases)
            if entries:
                kb_parts = ["## 知识库参考信息\n"]
                for entry in entries:
                    kb_parts.append(f"### {entry['title']}\n{entry['content']}\n")
                kb_context = "\n".join(kb_parts)

        effective_model = model or self.default_model

        async def event_generator():
            try:
                agent = AgentLoop(
                    llm_provider=self._get_llm_provider(effective_model),
                    api_key=self.default_api_key,
                    model=effective_model,
                    system_prompt=SYSTEM_PROMPT,
                    skill_system_prompt=skill_system_prompt,
                    kb_context=kb_context,
                    allowed_tools=allowed_tools if allowed_tools else None,
                    max_iterations=15,
                    base_url=self.default_base_url,
                )

                async for event in agent.run_stream(message):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    async def get_response(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        skill_id: Optional[str] = None,
        enable_tools: bool = True,
        model: Optional[str] = None,
        knowledge_bases: Optional[list] = None,
    ) -> Dict[str, Any]:
        try:
            skill_service = get_skill_service()
            skill_system_prompt, allowed_tools = skill_service.get_skill_system_prompt(skill_id)

            kb_context = ""
            if knowledge_bases:
                kb_service = get_knowledge_base_service()
                entries = kb_service.get_by_ids(knowledge_bases)
                if entries:
                    kb_parts = ["## 知识库参考信息\n"]
                    for entry in entries:
                        kb_parts.append(f"### {entry['title']}\n{entry['content']}\n")
                    kb_context = "\n".join(kb_parts)

            effective_model = model or self.default_model

            agent = AgentLoop(
                llm_provider=self._get_llm_provider(effective_model),
                api_key=self.default_api_key,
                model=effective_model,
                system_prompt=SYSTEM_PROMPT,
                skill_system_prompt=skill_system_prompt,
                kb_context=kb_context,
                allowed_tools=allowed_tools if allowed_tools else None,
                max_iterations=15,
                base_url=self.default_base_url,
            )

            full_content = ""
            async for event in agent.run_stream(message):
                if event.get("type") == "token":
                    full_content += event.get("content", "")
                elif event.get("type") == "done":
                    break
                elif event.get("type") == "error":
                    return {"error": event.get("content", "Unknown error")}

            return {"content": full_content}

        except Exception as e:
            return {"error": str(e)}
