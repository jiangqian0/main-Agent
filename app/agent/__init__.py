from pydantic import BaseModel
from typing import Any, Dict, Optional


class ToolInput(BaseModel):
    arguments: Dict[str, Any]


class ToolResult(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    preview: Optional[Dict[str, Any]] = None


class BaseTool:
    name: str
    description: str
    input_schema: Dict[str, Any]

    async def execute(self, **kwargs) -> ToolResult:
        raise NotImplementedError

    def get_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema
        }
