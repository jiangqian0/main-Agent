from typing import Optional, List
from pydantic import BaseModel


class Skill(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool = True
    category: str
    version: str = "1.0.0"
    icon: str = "fa-gear"
    is_builtin: bool = False
    trigger_keywords: List[str] = []
    system_prompt_addition: str = ""
    allowed_tools: List[str] = []
    tags: List[str] = []


class SkillCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "Custom"
    icon: str = "fa-gear"
    trigger_keywords: List[str] = []
    system_prompt_addition: str = ""
    allowed_tools: List[str] = []
    tags: List[str] = []

class FileInfo(BaseModel):
    name: str
    path: str
    size: int
    modified: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    skill_id: Optional[str] = None
    knowledge_bases: Optional[List[str]] = []
    enable_tools: Optional[bool] = True
    model: Optional[str] = None