"""
Agent Loop - LLM + 工具调用的流式迭代执行
"""

import json
import re
import asyncio
from typing import Dict, Any, List, Optional, AsyncGenerator
from app.agent.executor import ToolExecutor
from app.agent.tools import convert_to_openai_tools


class AgentLoop:
    def __init__(
        self,
        llm_provider: str,
        api_key: str,
        model: str,
        system_prompt: str = "",
        allowed_tools: Optional[List[str]] = None,
        max_iterations: int = 999999,
        base_url: Optional[str] = None,
        skill_system_prompt: str = "",
        kb_context: str = "",
    ):
        self.llm_provider = llm_provider
        self.api_key = api_key
        self.model = model
        self.base_system_prompt = system_prompt
        self.skill_system_prompt = skill_system_prompt
        self.kb_context = kb_context
        self.allowed_tools = allowed_tools
        self.max_iterations = max_iterations
        self.base_url = base_url
        self.tool_executor = ToolExecutor(allowed_tools=allowed_tools)
        self.messages: List[Dict[str, Any]] = []

    @property
    def system_prompt(self) -> str:
        """动态构建 system prompt，追加 skill 提示词和知识库上下文"""
        parts = []
        if self.base_system_prompt:
            parts.append(self.base_system_prompt)
        if self.skill_system_prompt:
            parts.append(f"## 当前 Skill 能力增强\n{self.skill_system_prompt}")
        if self.kb_context:
            parts.append(f"\n{self.kb_context}")
        return "\n\n".join(parts)

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def _build_messages(self) -> List[Dict[str, Any]]:
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.extend(self.messages)
        return messages

    async def run_stream(self, user_message: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式运行 Agent 循环。

        Yields SSE events:
          - {"type": "thinking", "content": str}       → 思考内容（累积）
          - {"type": "thinking_end"}                    → 思考阶段结束
          - {"type": "token", "content": str}         → 普通回复 token
          - {"type": "tool_call", "tool": str, "tool_call_id": str, "args": dict}
          - {"type": "tool_result", "success": bool, "tool": str, "result": str, "error": str}
          - {"type": "code_block_start", "file_name": str, "language": str, "total_lines": int}
          - {"type": "code_output", "content": str, "progress": int, "written": int, "total": int}
          - {"type": "code_block_end", "file_name": str, "total_lines": int}
          - {"type": "thinking_step", "content": str, "details": str}
          - {"type": "done", "content": str}
          - {"type": "error", "content": str}
        """
        self.add_message("user", user_message)
        iteration = 0
        full_content = ""
        thinking_buffer = ""

        while iteration < self.max_iterations:
            iteration += 1
            messages_to_send = self._build_messages()

            if self.llm_provider == "openai-compatible":
                async for event in self._call_openai_compatible_stream(messages_to_send):
                    evt_type = event.get("type")

                    if evt_type == "thinking":
                        thinking_buffer = event["content"]
                        yield {"type": "thinking", "content": thinking_buffer}

                    elif evt_type == "thinking_end":
                        yield {"type": "thinking_end"}

                    elif evt_type == "token":
                        token = event["content"]
                        full_content += token
                        yield {"type": "token", "content": token}

                    elif evt_type == "tool_calls":
                        tool_calls = event["content"]
                        self.add_message("assistant", full_content)

                        for tc in tool_calls:
                            tool_name = tc.get("function", {}).get("name", "unknown")
                            tool_call_id = tc.get("id", f"call_{iteration}")
                            tool_args_str = tc.get("function", {}).get("arguments", "{}")

                            # 解析参数
                            try:
                                args_dict = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str
                            except:
                                args_dict = {}

                            # 发送工具调用开始事件
                            yield {
                                "type": "tool_call",
                                "tool": tool_name,
                                "tool_call_id": tool_call_id,
                                "args": args_dict
                            }

                            # 发送 thinking_step
                            yield {
                                "type": "thinking_step",
                                "content": f"Calling {tool_name}...",
                                "details": json.dumps(args_dict, ensure_ascii=False)[:300]
                            }

                            # 执行工具
                            result = await self.tool_executor.execute_tool_call(tc)

                            # 检查是否是写文件类工具
                            write_tools = {"Write", "write_file", "create_file"}
                            is_write = tool_name in write_tools

                            if is_write and result.success and result.result:
                                preview = result.preview or {}
                                file_path = args_dict.get("file_path", "")
                                file_name = file_path.split("/")[-1] if file_path else "file"
                                lang = preview.get("language", self._detect_language(file_name))
                                content_to_show = preview.get("content", str(result.result))
                                total_lines = preview.get("total_lines", content_to_show.count("\n") + 1)
                                truncated = preview.get("truncated", False)

                                # code_block_start
                                yield {
                                    "type": "code_block_start",
                                    "file_name": file_name,
                                    "language": lang,
                                    "total_lines": total_lines,
                                    "truncated": truncated,
                                    "file_path": file_path
                                }

                                # 流式输出代码内容（分块）
                                chunk_size = 60
                                total = len(content_to_show)
                                for i in range(0, total, chunk_size):
                                    chunk = content_to_show[i:i + chunk_size]
                                    written = min(i + chunk_size, total)
                                    progress = int((written / total) * 100) if total > 0 else 100
                                    yield {
                                        "type": "code_output",
                                        "content": chunk,
                                        "progress": progress,
                                        "written": written,
                                        "total": total
                                    }
                                    await asyncio.sleep(0.003)

                                # code_block_end
                                yield {
                                    "type": "code_block_end",
                                    "file_name": file_name,
                                    "total_lines": total_lines
                                }

                                # 通知前端刷新 workspace 文件列表
                                yield {
                                    "type": "workspace_refresh",
                                    "file_name": file_name,
                                    "file_path": file_path
                                }

                            # 发送工具结果
                            yield {
                                "type": "tool_result",
                                "success": result.success,
                                "tool": tool_name,
                                "tool_call_id": tool_call_id,
                                "result": str(result.result) if result.result else None,
                                "error": result.error
                            }

                            # 添加到消息历史
                            tool_msg = {
                                "role": "tool",
                                "tool_call_id": tool_call_id,
                                "content": json.dumps({
                                    "success": result.success,
                                    "result": result.result,
                                    "error": result.error
                                }, ensure_ascii=False)
                            }
                            self.messages.append(tool_msg)

                            full_content = ""  # 重置，准备下一轮

                        break  # 继续下一轮循环

                    elif evt_type == "done":
                        self.add_message("assistant", full_content)
                        yield {"type": "done", "content": full_content}
                        return

                # 如果本轮没有工具调用但有内容，完成
                if not full_content:
                    continue

            elif self.llm_provider == "openai":
                async for event in self._call_openai_stream(messages_to_send):
                    evt_type = event.get("type")
                    if evt_type == "thinking":
                        thinking_buffer = event["content"]
                        yield {"type": "thinking", "content": thinking_buffer}
                    elif evt_type == "thinking_end":
                        yield {"type": "thinking_end"}
                    elif evt_type == "token":
                        token = event["content"]
                        full_content += token
                        yield {"type": "token", "content": token}
                    elif evt_type == "tool_calls":
                        tool_calls = event["content"]
                        self.add_message("assistant", full_content)
                        for tc in tool_calls:
                            tool_name = tc.get("function", {}).get("name", "unknown")
                            tool_call_id = tc.get("id", "")
                            tool_args_str = tc.get("function", {}).get("arguments", "{}")
                            try:
                                args_dict = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str
                            except:
                                args_dict = {}
                            yield {"type": "tool_call", "tool": tool_name, "tool_call_id": tool_call_id, "args": args_dict}
                            result = await self.tool_executor.execute_tool_call(tc)
                            yield {
                                "type": "tool_result", "success": result.success,
                                "tool": tool_name, "tool_call_id": tool_call_id,
                                "result": str(result.result) if result.result else None,
                                "error": result.error
                            }
                            tool_msg = {
                                "role": "tool", "tool_call_id": tool_call_id,
                                "content": json.dumps({"success": result.success, "result": result.result, "error": result.error}, ensure_ascii=False)
                            }
                            self.messages.append(tool_msg)
                            full_content = ""
                        break
                    elif evt_type == "done":
                        self.add_message("assistant", full_content)
                        yield {"type": "done", "content": full_content}
                        return
            else:
                raise ValueError(f"不支持的 LLM 提供商: {self.llm_provider}")

        yield {"type": "error", "content": f"达到最大迭代次数 ({self.max_iterations})"}

    def _detect_language(self, file_name: str) -> str:
        import os
        ext = os.path.splitext(file_name)[1].lower()
        lang_map = {
            '.py': 'python', '.js': 'javascript', '.jsx': 'jsx',
            '.ts': 'typescript', '.tsx': 'tsx', '.html': 'html',
            '.css': 'css', '.json': 'json', '.md': 'markdown',
            '.sql': 'sql', '.sh': 'bash', '.yaml': 'yaml',
            '.yml': 'yaml', '.go': 'go', '.rs': 'rust',
            '.java': 'java', '.cpp': 'cpp', '.c': 'c',
            '.rb': 'ruby', '.php': 'php', '.xml': 'xml',
        }
        return lang_map.get(ext, 'text')

    async def _call_openai_stream(self, messages: List[Dict]) -> AsyncGenerator[Dict, None]:
        import httpx

        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        tools = convert_to_openai_tools(self.tool_executor.get_tools_definitions())

        data = {
            "model": self.model, "messages": messages,
            "tools": tools or None, "tool_choice": "auto", "stream": True
        }

        full_content = ""
        thinking_buffer = ""
        tool_calls_buffer = []
        in_thinking = False

        try:
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, trust_env=False, verify=False) as client:
                async with client.stream("POST", url, headers=headers, json=data) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            if line == "data: [DONE]":
                                break
                            try:
                                chunk = json.loads(line[6:])
                                delta = chunk.get("choices", [{}])[0].get("delta", {})

                                content = delta.get("content") or ""
                                if "[THINKING]" in content:
                                    parts = content.split("[THINKING]")
                                    if parts[0]:
                                        full_content += parts[0]
                                        yield {"type": "token", "content": parts[0]}
                                    thinking_buffer = ""
                                    in_thinking = True
                                    remaining = "[THINKING]".join(parts[1:])
                                    if "[/THINKING]" in remaining:
                                        end_parts = remaining.split("[/THINKING]")
                                        thinking_buffer += end_parts[0]
                                        yield {"type": "thinking", "content": thinking_buffer}
                                        thinking_buffer = ""
                                        in_thinking = False
                                        if end_parts[1]:
                                            full_content += end_parts[1]
                                            yield {"type": "token", "content": end_parts[1]}
                                    else:
                                        thinking_buffer += remaining
                                        yield {"type": "thinking", "content": thinking_buffer}
                                elif "[/THINKING]" in content:
                                    parts = content.split("[/THINKING]")
                                    thinking_buffer += parts[0]
                                    yield {"type": "thinking", "content": thinking_buffer}
                                    thinking_buffer = ""
                                    in_thinking = False
                                    if parts[1]:
                                        full_content += parts[1]
                                        yield {"type": "token", "content": parts[1]}
                                elif in_thinking:
                                    thinking_buffer += content
                                    yield {"type": "thinking", "content": thinking_buffer}
                                else:
                                    full_content += content
                                    yield {"type": "token", "content": content}

                                tc_delta = delta.get("tool_calls")
                                if tc_delta:
                                    for tcd in tc_delta:
                                        idx = tcd.get("index", 0)
                                        while len(tool_calls_buffer) <= idx:
                                            tool_calls_buffer.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                        if tcd.get("id"):
                                            tool_calls_buffer[idx]["id"] = tcd["id"]
                                        func = tcd.get("function", {})
                                        if func.get("name"):
                                            tool_calls_buffer[idx]["function"]["name"] = func["name"]
                                        if func.get("arguments"):
                                            tool_calls_buffer[idx]["function"]["arguments"] += func["arguments"]
                            except json.JSONDecodeError:
                                continue

                    if tool_calls_buffer:
                        yield {"type": "tool_calls", "content": tool_calls_buffer}
                    else:
                        yield {"type": "done", "content": full_content}

        except Exception as e:
            raise

    async def _call_openai_compatible_stream(self, messages: List[Dict]) -> AsyncGenerator[Dict, None]:
        """调用 OpenAI 兼容 API 流式接口（如通义千问国际版 Qwen3）"""
        import httpx
        import os

        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        tools = convert_to_openai_tools(self.tool_executor.get_tools_definitions())

        print(f"[AgentLoop] API Key length: {len(self.api_key) if self.api_key else 0}")
        print(f"[AgentLoop] Model: {self.model}")
        print(f"[AgentLoop] Base URL: {self.base_url}")

        data = {
            "model": self.model, "messages": messages,
            "tools": tools or None, "tool_choice": "auto", "stream": True
        }

        # Qwen 模型启用思考模式
        if "qwen" in self.model.lower():
            if "parameters" not in data:
                data["parameters"] = {}
            data["parameters"]["thinking"] = True
            data["enable_thinking"] = True
            data["thinking"] = True

        full_content = ""
        thinking_buffer = ""
        tool_calls_buffer = []
        thinking_started = False
        thinking_ended = False

        # 临时禁用代理
        orig_http = os.environ.pop("HTTP_PROXY", None)
        orig_https = os.environ.pop("HTTPS_PROXY", None)
        orig_http_l = os.environ.pop("http_proxy", None)
        orig_https_l = os.environ.pop("https_proxy", None)

        try:
            async with httpx.AsyncClient(
                timeout=120.0, follow_redirects=True,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
                trust_env=False, verify=False
            ) as client:
                async with client.stream("POST", url, headers=headers, json=data) as resp:
                    print(f"[AgentLoop] Response status: {resp.status_code}")
                    resp.raise_for_status()
                    last_data_time = asyncio.get_event_loop().time()
                    fast_timeout = 5.0
                    normal_timeout = 30.0
                    chunks_received = 0

                    async for line in resp.aiter_lines():
                        chunks_received += 1
                        if chunks_received == 1:
                            print(f"[AgentLoop] First chunk: {line[:100]}...")
                        current_time = asyncio.get_event_loop().time()
                        if not line.startswith("data: "):
                            continue

                        last_data_time = current_time
                        if line == "data: [DONE]":
                            if thinking_buffer and not thinking_ended:
                                yield {"type": "thinking_end"}
                                thinking_ended = True
                            break

                        try:
                            chunk = json.loads(line[6:])
                        except json.JSONDecodeError:
                            continue

                        delta = chunk.get("choices", [{}])[0].get("delta", {})

                        # 尝试获取思考内容（Qwen3 通过 reasoning_content 字段返回）
                        thinking_content = (
                            delta.get("reasoning_content") or
                            delta.get("thinking") or
                            delta.get("reasoning") or
                            ""
                        )
                        content = delta.get("content") or ""
                        has_tool_calls = delta.get("tool_calls") is not None

                        # 处理思考内容
                        if thinking_content:
                            thinking_buffer += thinking_content
                            thinking_started = True
                            yield {"type": "thinking", "content": thinking_buffer}

                        # 处理普通内容或工具调用
                        if content or has_tool_calls:
                            if thinking_buffer and not thinking_ended:
                                yield {"type": "thinking_end"}
                                thinking_ended = True
                            if content and not thinking_content:
                                full_content += content
                                yield {"type": "token", "content": content}

                        # 处理工具调用
                        tc_in_delta = delta.get("tool_calls")
                        if tc_in_delta:
                            if thinking_buffer and not thinking_ended:
                                yield {"type": "thinking_end"}
                                thinking_ended = True

                            for tcd in tc_in_delta:
                                idx = tcd.get("index", 0)
                                while len(tool_calls_buffer) <= idx:
                                    tool_calls_buffer.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                if tcd.get("id"):
                                    tool_calls_buffer[idx]["id"] = tcd["id"]
                                func = tcd.get("function", {})
                                if func.get("name"):
                                    tool_calls_buffer[idx]["function"]["name"] = func["name"]
                                if func.get("arguments"):
                                    tool_calls_buffer[idx]["function"]["arguments"] += func["arguments"]

                        # 检查超时
                        if current_time - last_data_time > (fast_timeout if (thinking_ended and tool_calls_buffer) else normal_timeout):
                            if thinking_buffer and not thinking_ended:
                                yield {"type": "thinking_end"}
                                thinking_ended = True
                            break

                    if tool_calls_buffer:
                        print(f"[AgentLoop] Stream complete: tool_calls detected ({len(tool_calls_buffer)} calls)")
                        yield {"type": "tool_calls", "content": tool_calls_buffer}
                    else:
                        # 如果 full_content 为空但有 thinking_content（模型直接把回复放在思考字段里）
                        # 将思考内容作为正式回复返回给用户
                        final_content = full_content
                        if not final_content and thinking_buffer:
                            final_content = thinking_buffer
                            print(f"[AgentLoop] Using thinking_content as response ({len(final_content)} chars)")
                        print(f"[AgentLoop] Stream complete: done, full_content length = {len(final_content)}")
                        yield {"type": "done", "content": final_content}

        except httpx.HTTPStatusError as e:
            print(f"[AgentLoop] HTTP error: {e.response.status_code} - {e.response.text[:500]}")
            raise
        except Exception as e:
            print(f"[AgentLoop] Stream error: {type(e).__name__}: {e}")
            raise
        finally:
            if orig_http is not None: os.environ["HTTP_PROXY"] = orig_http
            if orig_https is not None: os.environ["HTTPS_PROXY"] = orig_https
            if orig_http_l is not None: os.environ["http_proxy"] = orig_http_l
            if orig_https_l is not None: os.environ["https_proxy"] = orig_https_l
