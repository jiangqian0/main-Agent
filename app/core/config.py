import os
from pathlib import Path

class Settings:
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.dashscope_api_key = os.getenv("DASHSCOPE_API_KEY", "")
        self.api_base_url = os.getenv("API_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        self.default_model = os.getenv("DEFAULT_MODEL", "qwen3-max")
        self.workspace_dir = os.getenv("WORKSPACE_DIR", "./workspace")

settings = Settings()

WORKSPACE_DIR = Path(settings.workspace_dir)
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)