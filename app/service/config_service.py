"""
Config Service - 配置管理服务
"""
import json
import os
from pathlib import Path
from typing import Dict, Any


class ConfigService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._data_dir = Path("app/data")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._config_file = self._data_dir / "config.json"
        self._config: Dict[str, Any] = self._load_defaults()
        self._load()

    def _load_defaults(self) -> Dict[str, Any]:
        return {
            "api_key": os.getenv("DASHSCOPE_API_KEY", "") or os.getenv("OPENAI_API_KEY", "") or "your-api-key-here",
            "api_base_url": os.getenv("API_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
            "model": os.getenv("DEFAULT_MODEL", "qwen3-max"),
            "temperature": 0.7,
            "max_tokens": 4096,
            "theme": "light",
            "sidebar_width": 260,
            "username": "User",
        }

    def _load(self):
        if self._config_file.exists():
            try:
                with open(self._config_file, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    for key in ["api_key", "api_base_url", "model", "temperature",
                                "max_tokens", "theme", "sidebar_width", "username"]:
                        if key in saved and saved[key] not in (None, ""):
                            self._config[key] = saved[key]
            except (json.JSONDecodeError, Exception):
                pass

    def _save(self):
        with open(self._config_file, "w", encoding="utf-8") as f:
            json.dump(self._config, f, ensure_ascii=False, indent=2)

    def get_config(self) -> Dict[str, Any]:
        return dict(self._config)

    def get(self, key: str, default: Any = None) -> Any:
        return self._config.get(key, default)

    def update(self, config: Dict[str, Any]) -> Dict[str, Any]:
        for key in ["api_key", "api_base_url", "model", "temperature",
                    "max_tokens", "theme", "sidebar_width", "username"]:
            if key in config:
                self._config[key] = config[key]
        self._save()
        return self._config


def get_config_service() -> ConfigService:
    return ConfigService()
