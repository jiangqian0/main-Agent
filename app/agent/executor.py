import json
from typing import Dict, Any, Optional, List
from app.tools.base import ToolResult
from app.tools.registry import get_registry


class ToolExecutor:
    def __init__(self, allowed_tools: Optional[List[str]] = None):
        self.registry = get_registry()
        self.allowed_tools = allowed_tools

    def is_tool_allowed(self, tool_name: str) -> bool:
        if self.allowed_tools is None:
            return True
        return tool_name in self.allowed_tools

    async def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        if not self.is_tool_allowed(tool_name):
            return ToolResult(success=False, error=f"Tool {tool_name} not allowed")
        tool = self.registry.get(tool_name)
        if tool is None:
            return ToolResult(success=False, error=f"Tool not found: {tool_name}")
        try:
            return await tool.execute(**arguments)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    async def execute_tool_call(self, tool_call: Dict[str, Any]) -> ToolResult:
        tool_name = tool_call.get("function", {}).get("name", "")
        arguments_str = tool_call.get("function", {}).get("arguments", "{}")
        try:
            arguments = json.loads(arguments_str)
        except json.JSONDecodeError:
            return ToolResult(success=False, error="Invalid JSON in arguments")
        return await self.execute(tool_name, arguments)

    def get_tools_definitions(self) -> List[Dict[str, Any]]:
        definitions = self.registry.list_tools()
        if self.allowed_tools is None:
            return definitions
        return [d for d in definitions if d.get("name") in self.allowed_tools]
