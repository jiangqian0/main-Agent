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

class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    category: Optional[str] = None
    version: Optional[str] = None
    icon: Optional[str] = None
    is_builtin: Optional[bool] = None
    trigger_keywords: Optional[List[str]] = None
    system_prompt_addition: Optional[str] = None
    allowed_tools: Optional[List[str]] = None
    tags: Optional[List[str]] = None

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
    mode: Optional[str] = "agent"  # "agent" | "plan" | "ask"
    plan_confirmed: Optional[bool] = False
    auth_token: Optional[str] = None  # 用户认证token，用于获取用户API Key配置