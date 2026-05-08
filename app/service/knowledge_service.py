"""
Knowledge Base Service - 知识库管理服务
"""
import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional


class KnowledgeBaseService:
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
        self._kb_file = self._data_dir / "knowledge_base.json"
        self._entries: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        if self._kb_file.exists():
            try:
                with open(self._kb_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._entries = data.get("entries", [])
            except (json.JSONDecodeError, Exception):
                self._entries = []
        else:
            self._entries = []

    def _save(self):
        with open(self._kb_file, "w", encoding="utf-8") as f:
            json.dump({"entries": self._entries}, f, ensure_ascii=False, indent=2)

    def get_all(self) -> List[Dict[str, Any]]:
        return self._entries

    def get(self, kb_id: str) -> Optional[Dict[str, Any]]:
        return next((e for e in self._entries if e["id"] == kb_id), None)

    def create(
        self,
        title: str,
        content: str,
        category: str = "General",
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        entry = {
            "id": f"kb-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(self._entries):03d}",
            "title": title,
            "content": content,
            "category": category,
            "tags": tags or [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        self._entries.insert(0, entry)
        self._save()
        return entry

    def update(
        self,
        kb_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        for e in self._entries:
            if e["id"] == kb_id:
                if title is not None:
                    e["title"] = title
                if content is not None:
                    e["content"] = content
                if category is not None:
                    e["category"] = category
                if tags is not None:
                    e["tags"] = tags
                e["updated_at"] = datetime.now().isoformat()
                self._save()
                return e
        return None

    def delete(self, kb_id: str) -> bool:
        before = len(self._entries)
        self._entries = [e for e in self._entries if e["id"] != kb_id]
        if len(self._entries) < before:
            self._save()
            return True
        return False

    def search(self, query: str) -> List[Dict[str, Any]]:
        q = query.lower()
        return [
            e
            for e in self._entries
            if q in (e.get("title", "") or "").lower()
            or q in (e.get("content", "") or "").lower()
            or any(q in (t or "").lower() for t in e.get("tags", []))
        ]

    def get_by_ids(self, ids: List[str]) -> List[Dict[str, Any]]:
        return [e for e in self._entries if e["id"] in ids]

    def get_categories(self) -> List[str]:
        cats = set(e.get("category", "General") for e in self._entries)
        return sorted(cats)


def get_knowledge_base_service() -> KnowledgeBaseService:
    return KnowledgeBaseService()
