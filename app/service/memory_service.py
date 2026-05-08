"""
Memory Service - 记忆管理服务
"""
import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional


class MemoryService:
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
        self._memories_file = self._data_dir / "memories.json"
        self._config_file = self._data_dir / "memory_config.json"
        self._memories: List[Dict[str, Any]] = []
        self._config: Dict[str, Any] = {
            "token_threshold": 8000,
            "extract_interval": 5,
        }
        self._load_memories()
        self._load_config()

    # ── Persistence ─────────────────────────────────────────

    def _load_memories(self):
        if self._memories_file.exists():
            try:
                with open(self._memories_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._memories = data.get("memories", [])
            except (json.JSONDecodeError, Exception):
                self._memories = []
        else:
            self._memories = []

    def _save_memories(self):
        data = {"memories": self._memories}
        with open(self._memories_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _load_config(self):
        if self._config_file.exists():
            try:
                with open(self._config_file, "r", encoding="utf-8") as f:
                    self._config = json.load(f)
            except (json.JSONDecodeError, Exception):
                self._config = {"token_threshold": 8000, "extract_interval": 5}
        else:
            self._config = {"token_threshold": 8000, "extract_interval": 5}

    def _save_config(self):
        with open(self._config_file, "w", encoding="utf-8") as f:
            json.dump(self._config, f, ensure_ascii=False, indent=2)

    # ── Memory CRUD ─────────────────────────────────────────

    def get_all_memories(self) -> List[Dict[str, Any]]:
        return self._memories

    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        return next((m for m in self._memories if m["id"] == memory_id), None)

    def add_memory(
        self,
        content: str,
        description: str = "",
        memory_type: str = "knowledge",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        memory = {
            "id": f"mem-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(self._memories):03d}",
            "content": content,
            "description": description,
            "type": memory_type,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "metadata": metadata or {},
        }
        self._memories.insert(0, memory)
        self._save_memories()
        return memory

    def update_memory(
        self,
        memory_id: str,
        content: Optional[str] = None,
        description: Optional[str] = None,
        memory_type: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        for m in self._memories:
            if m["id"] == memory_id:
                if content is not None:
                    m["content"] = content
                if description is not None:
                    m["description"] = description
                if memory_type is not None:
                    m["type"] = memory_type
                m["updated_at"] = datetime.now().isoformat()
                self._save_memories()
                return m
        return None

    def delete_memory(self, memory_id: str) -> bool:
        before = len(self._memories)
        self._memories = [m for m in self._memories if m["id"] != memory_id]
        if len(self._memories) < before:
            self._save_memories()
            return True
        return False

    def search_memories(self, query: str) -> List[Dict[str, Any]]:
        q = query.lower()
        return [
            m
            for m in self._memories
            if q in (m.get("content", "") or "").lower()
            or q in (m.get("description", "") or "").lower()
        ]

    # ── Config ──────────────────────────────────────────────

    def get_config(self) -> Dict[str, Any]:
        return self._config

    def update_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        self._config.update(config)
        self._save_config()
        return self._config


def get_memory_service() -> MemoryService:
    return MemoryService()
