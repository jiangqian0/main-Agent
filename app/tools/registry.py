from typing import Dict, List, Optional, Any
from .base import BaseTool, ToolResult
from .file_tool import ReadTool, WriteTool, EditTool
from .bash_tool import BashTool
from .search_tool import GlobTool, GrepTool


class ToolRegistry:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._tools: Dict[str, BaseTool] = {}
        self._initialized = True
        self._register_default_tools()

    def _register_default_tools(self):
        tools = [ReadTool(), WriteTool(), EditTool(), BashTool(), GlobTool(), GrepTool()]
        for tool in tools:
            self.register(tool)

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        return [tool.get_definition() for tool in self._tools.values()]

    def get_tool_names(self) -> List[str]:
        return list(self._tools.keys())

    async def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        tool = self.get(tool_name)
        if not tool:
            return ToolResult(success=False, error=f"Tool not found: {tool_name}")
        try:
            result = await tool.execute(**arguments)
            return result
        except Exception as e:
            return ToolResult(success=False, error=str(e))


def get_registry() -> ToolRegistry:
    return ToolRegistry()
