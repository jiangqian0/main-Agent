from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pydantic import BaseModel


class ToolInput(BaseModel):
    arguments: Dict[str, Any]


class ToolResult(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    preview: Optional[Dict[str, Any]] = None


class BaseTool(ABC):
    name: str
    description: str
    input_schema: Dict[str, Any]

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        pass

    def get_definition(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema
        }
