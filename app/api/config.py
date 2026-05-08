from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.service.config_service import get_config_service

router = APIRouter()


@router.get("")
async def get_config() -> Dict[str, Any]:
    try:
        service = get_config_service()
        config = service.get_config()
        # Mask API key for security
        if config.get("api_key"):
            config["api_key"] = mask_key(config["api_key"])
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def update_config(config: Dict[str, Any]) -> Dict[str, Any]:
    try:
        service = get_config_service()
        # Only save non-sensitive fields from client for security
        safe_fields = ["api_base_url", "model", "theme", "sidebar_width", "username"]
        filtered = {k: v for k, v in config.items() if k in safe_fields and v is not None}
        updated = service.update(filtered)
        if updated.get("api_key"):
            updated["api_key"] = mask_key(updated["api_key"])
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def get_available_models() -> Dict[str, Any]:
    return {
        "models": [
            {"id": "qwen3-max", "name": "Qwen3 Max", "provider": "Alibaba Cloud"},
            {"id": "qwen3-plus", "name": "Qwen3 Plus", "provider": "Alibaba Cloud"},
            {"id": "qwen3", "name": "Qwen3", "provider": "Alibaba Cloud"},
            {"id": "qwen-plus", "name": "Qwen Plus", "provider": "Alibaba Cloud"},
            {"id": "qwen-turbo", "name": "Qwen Turbo", "provider": "Alibaba Cloud"},
            {"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "provider": "OpenAI"},
            {"id": "claude-3-5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "Anthropic"},
            {"id": "claude-3-opus", "name": "Claude 3 Opus", "provider": "Anthropic"},
        ],
        "default": "qwen3-max",
    }


def mask_key(key: str) -> str:
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


@router.post("/api-key")
async def save_api_key(body: Dict[str, Any]) -> Dict[str, str]:
    """Save API key to server-side config (more secure)"""
    api_key = body.get("api_key", "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    service = get_config_service()
    service.update({"api_key": api_key})
    return {"message": "API key saved", "api_key": mask_key(api_key)}
