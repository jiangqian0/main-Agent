from typing import Dict, Any, Optional
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
import json
from app.agent.loop import AgentLoop
from app.service.skill_service import get_skill_service
from app.service.knowledge_service import get_knowledge_base_service
from app.service.config_service import get_config_service


SYSTEM_PROMPT = """你是一个专业的 AI 软件开发助手。

**你的能力**
- 读取、编写、修改文件和执行命令来完成代码任务
- 可用工具：Read（读文件）、Write（写文件）、Edit（改文件）、Bash（执行命令）
- 自动进行多轮思考和工具调用，直到任务完成

**工作方式（Agent 模式 — 自动执行）**
你拥有完整的自主执行权。当用户描述一个任务时，你会：
1. 分析需求和现有代码（如有必要先读取文件）
2. 制定行动计划
3. 立即开始执行，不需要用户确认
4. 实时报告每一步的进展和结果
5. 完成后总结所做的改动

**文件附件说明**
如果用户上传了文件，它们位于工作区的临时目录中。你可以读取这些文件来了解上下文。

**回复风格**
- 简洁直接，代码优先
- 遇到不确定的地方，先说明假设再行动
- 如果某个操作有风险，先提醒用户再执行"""

SYSTEM_PROMPT_ASK = """你是一个专业的 AI 问答助手。

**你的能力**
- 回答编程问题、解释概念、分析代码
- 帮助调试、分析报错、理解文档

**你的限制**
- **不能**执行任何操作：不写文件、不执行命令、不调用任何工具
- 只能通过文字描述来回答，不能主动查看文件
- 如果需要看代码才能回答，请明确告诉用户你需要看到什么

**回复风格**
- 精准、简洁、有条理
- 用代码示例来说明概念（代码块用 ```包裹）
- 先说结论，再解释原因
- 遇到模糊问题时，主动询问关键信息"""

SYSTEM_PROMPT_PLAN = """你是一个任务规划助手，**不会执行任何操作**，只会输出计划。

**工作方式（Plan 模式）**
当用户描述一个任务时，你**只**做以下事情：
1. 理解用户的最终目标
2. 分析需要修改/创建哪些文件
3. 列出详细的执行步骤，说明每一步：
   - 会使用什么工具（Read / Write / Edit / Bash）
   - 目标文件是什么
   - 大致要做什么
4. 评估潜在风险和前置条件
5. 询问是否有遗漏或需要调整的地方

**输出格式**
请使用 Markdown 格式输出计划，包含：
- **目标**：一句话描述要完成什么
- **步骤列表**：每个步骤包含序号、工具、目标文件、操作说明
- **风险提示**：任何可能有问题的地方
- **确认问题**：你需要向用户确认的关键问题

**重要**：不要实际执行任何操作！只输出计划供用户审阅。
用户点击"Execute"后，Agent 模式会用实际执行来回应你的计划。"""

SYSTEM_PROMPT_AGENT = """你是一个专业的 AI 软件开发助手。

**你的背景**
用户已经在 Plan 模式下审阅并确认了执行计划。你需要**严格按照该计划执行**。

**你的能力**
- 读取、编写、修改文件和执行命令
- 可用工具：Read（读文件）、Write（写文件）、Edit（改文件）、Bash（执行命令）

**工作方式（Plan 确认后执行）**
用户已经看过你的计划并点击了"Execute"。请严格按照计划执行：
1. 按照计划中的步骤顺序执行
2. 每完成一个步骤，在回复中简述进展
3. 如果遇到计划外的情况，说明原因并给出替代方案，请用户确认
4. 完成后提供完整的执行总结

**回复风格**
- 有条理，每步都有清晰的进展标记
- 遇到问题不擅自改变计划，先汇报再行动
- 最后给出完整的改动清单"""


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
        mode: str = "agent",
        plan_confirmed: bool = False,
    ):
        skill_service = get_skill_service()
        skill_system_prompt, allowed_tools = skill_service.get_skill_system_prompt(skill_id)

        cfg = get_config_service()
        current_api_key = cfg.get("api_key") or ""
        current_base_url = cfg.get("api_base_url", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")

        kb_context = ""
        if knowledge_bases:
            kb_service = get_knowledge_base_service()
            entries = kb_service.get_by_ids(knowledge_bases)
            if entries:
                kb_parts = ["## 知识库参考信息\n"]
                for entry in entries:
                    kb_parts.append(f"### {entry['title']}\n{entry['content']}\n")
                kb_context = "\n".join(kb_parts)

        effective_model = model or cfg.get("model", "qwen3-max")

        # 根据模式决定工具和系统提示
        #
        # Ask   → 无工具，纯问答
        # Plan  → 无工具，只输出计划
        # Agent → 有工具，自动执行（plan_confirmed 时用 PLAN_AGENT prompt，严格执行计划）
        if mode == "ask":
            effective_tools = []
            system_prompt = SYSTEM_PROMPT_ASK
        elif mode == "plan":
            effective_tools = []
            system_prompt = SYSTEM_PROMPT_PLAN
        elif plan_confirmed:
            # Plan 确认后执行：AI 已经看过自己的计划，用户点击了 Execute
            # 必须严格按计划执行，不允许偏离
            effective_tools = allowed_tools if allowed_tools else None
            system_prompt = SYSTEM_PROMPT_AGENT
        else:
            # 普通 Agent 模式
            effective_tools = allowed_tools if allowed_tools else None
            system_prompt = SYSTEM_PROMPT

        async def event_generator():
            try:
                agent = AgentLoop(
                    llm_provider=self._get_llm_provider(effective_model),
                    api_key=current_api_key,
                    model=effective_model,
                    system_prompt=system_prompt,
                    skill_system_prompt=skill_system_prompt,
                    kb_context=kb_context,
                    allowed_tools=effective_tools,
                    max_iterations=999999 if mode == "agent" else 1,
                    base_url=current_base_url,
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
        mode: str = "agent",
        plan_confirmed: bool = False,
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

            cfg = get_config_service()
            current_api_key = cfg.get("api_key") or ""
            current_base_url = cfg.get("api_base_url", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
            effective_model = model or cfg.get("model", "qwen3-max")

            if mode == "ask":
                effective_tools = []
                system_prompt = SYSTEM_PROMPT_ASK
            elif mode == "plan":
                effective_tools = []
                system_prompt = SYSTEM_PROMPT_PLAN
            elif plan_confirmed:
                effective_tools = allowed_tools if allowed_tools else None
                system_prompt = SYSTEM_PROMPT_AGENT
            else:
                effective_tools = allowed_tools if allowed_tools else None
                system_prompt = SYSTEM_PROMPT

            agent = AgentLoop(
                llm_provider=self._get_llm_provider(effective_model),
                api_key=current_api_key,
                model=effective_model,
                system_prompt=system_prompt,
                skill_system_prompt=skill_system_prompt,
                kb_context=kb_context,
                allowed_tools=effective_tools,
                max_iterations=999999 if mode == "agent" else 1,
                base_url=current_base_url,
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
