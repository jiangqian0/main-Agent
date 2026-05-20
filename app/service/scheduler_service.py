"""
Scheduler Service — manages scheduled tasks with AI agent execution.
Stores tasks in app/data/scheduled_tasks.json.
"""
import json
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable
from enum import Enum

DATA_DIR = Path(__file__).parent.parent / "data"
TASKS_FILE = DATA_DIR / "scheduled_tasks.json"
HISTORY_FILE = DATA_DIR / "task_history.json"


class TaskStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"


class SchedulerService:
    _instance = None

    def __init__(self):
        self._tasks: list[dict] = []
        self._history: list[dict] = []
        self._running_tasks: dict[str, asyncio.Task] = {}
        self._agent_executor: Optional[Callable] = None
        self._load_tasks()
        self._load_history()

    @classmethod
    def get_instance(cls) -> "SchedulerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Persistence ────────────────────────────────────────────────────────────

    def _load_tasks(self):
        if TASKS_FILE.exists():
            try:
                with open(TASKS_FILE, "r", encoding="utf-8") as f:
                    self._tasks = json.load(f)
            except Exception:
                self._tasks = []
        else:
            self._tasks = self._get_default_tasks()
            self._save_tasks()

    def _save_tasks(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(TASKS_FILE, "w", encoding="utf-8") as f:
            json.dump(self._tasks, f, ensure_ascii=False, indent=2)

    def _load_history(self):
        if HISTORY_FILE.exists():
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    self._history = json.load(f)
            except Exception:
                self._history = []
        else:
            self._history = []

    def _save_history(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(self._history, f, ensure_ascii=False, indent=2)

    # ── Default Preset Tasks ────────────────────────────────────────────────────

    def _get_default_tasks(self) -> list[dict]:
        return [
            {
                "id": "preset_code_review",
                "name": "Daily Code Review Reminder",
                "description": "Remind the team to conduct code reviews daily to ensure code quality.",
                "prompt": "Please generate a code review checklist covering:\n1. Code readability checkpoints\n2. Security checklist items\n3. Performance optimization suggestions\n4. Best practice checks\n\nOutput in structured Markdown format for team use.",
                "schedule_type": "daily",
                "schedule_value": "09:00",
                "enabled": False,
                "is_preset": True,
                "model": "qwen3-max",
                "mode": "ask",
                "created_at": datetime.now().isoformat(),
            },
            {
                "id": "preset_standup",
                "name": "Daily Standup Summary",
                "description": "Generate a project progress summary each morning to keep the team aligned.",
                "prompt": "Based on the following information, generate a brief daily standup summary (3 sentences max):\n1. Yesterday's progress\n2. Today's plan\n3. Blockers encountered\n\nUse clear bullet points.",
                "schedule_type": "daily",
                "schedule_value": "08:30",
                "enabled": False,
                "is_preset": True,
                "model": "qwen3-max",
                "mode": "ask",
                "created_at": datetime.now().isoformat(),
            },
            {
                "id": "preset_bug_report",
                "name": "Bug Report Triage",
                "description": "Scan known bugs and generate a priority report on a weekly basis.",
                "prompt": "Analyze the following bug list, rank by severity and impact, and provide fix priority suggestions:\n1. P0 (system crash / data loss)\n2. P1 (core feature unavailable)\n3. P2 (minor feature impaired)\n4. P3 (UX issues)\n\nOutput: table + brief explanation.",
                "schedule_type": "weekly",
                "schedule_value": "monday",
                "enabled": False,
                "is_preset": True,
                "model": "qwen3-max",
                "mode": "ask",
                "created_at": datetime.now().isoformat(),
            },
            {
                "id": "preset_deploy_check",
                "name": "Pre-Deploy Checklist",
                "description": "Remind the team to run pre-deployment checks at the scheduled time.",
                "prompt": "Generate a pre-deployment checklist covering:\n1. Database migration check\n2. Environment variable validation\n3. Dependency version confirmation\n4. Rollback plan preparation\n5. Monitoring & alerting confirmation\n\nAdd a brief explanation for each item.",
                "schedule_type": "weekly",
                "schedule_value": "friday",
                "enabled": False,
                "is_preset": True,
                "model": "qwen3-max",
                "mode": "ask",
                "created_at": datetime.now().isoformat(),
            },
            {
                "id": "preset_weekly_summary",
                "name": "Weekly Work Summary",
                "description": "Generate a weekly work summary and next-week plan draft every Friday.",
                "prompt": "Based on the following content, generate a weekly work summary:\n1. Major tasks completed this week\n2. Key metric achievements\n3. Issues encountered and resolutions\n4. Next week's work plan (sorted by priority)\n\nUse professional project management format.",
                "schedule_type": "weekly",
                "schedule_value": "friday",
                "enabled": False,
                "is_preset": True,
                "model": "qwen3-max",
                "mode": "ask",
                "created_at": datetime.now().isoformat(),
            },
        ]

    # ── CRUD ───────────────────────────────────────────────────────────────────

    def get_all_tasks(self) -> list[dict]:
        return self._tasks

    def get_task(self, task_id: str) -> Optional[dict]:
        for t in self._tasks:
            if t["id"] == task_id:
                return t
        return None

    def create_task(self, task_data: dict) -> dict:
        task = {
            "id": "task_" + uuid.uuid4().hex[:12],
            "name": task_data.get("name", "Untitled Task"),
            "description": task_data.get("description", ""),
            "prompt": task_data.get("prompt", ""),
            "schedule_type": task_data.get("schedule_type", "once"),
            "schedule_value": task_data.get("schedule_value", ""),
            "enabled": task_data.get("enabled", True),
            "is_preset": False,
            "model": task_data.get("model", "qwen3-max"),
            "mode": task_data.get("mode", "ask"),
            "created_at": datetime.now().isoformat(),
        }
        self._tasks.append(task)
        self._save_tasks()
        return task

    def update_task(self, task_id: str, updates: dict) -> Optional[dict]:
        for i, t in enumerate(self._tasks):
            if t["id"] == task_id:
                for k, v in updates.items():
                    if k not in ("id", "is_preset", "created_at"):
                        self._tasks[i][k] = v
                self._save_tasks()
                return self._tasks[i]
        return None

    def delete_task(self, task_id: str) -> bool:
        original = len(self._tasks)
        self._tasks = [t for t in self._tasks if t["id"] != task_id]
        if len(self._tasks) < original:
            self._save_tasks()
            return True
        return False

    def toggle_task(self, task_id: str) -> Optional[dict]:
        for i, t in enumerate(self._tasks):
            if t["id"] == task_id:
                self._tasks[i]["enabled"] = not self._tasks[i]["enabled"]
                self._save_tasks()
                return self._tasks[i]
        return None

    def run_task_now(self, task_id: str) -> Optional[dict]:
        task = self.get_task(task_id)
        if not task:
            return None
        return self._execute_task(task)

    def _execute_task(self, task: dict) -> dict:
        """Execute a task synchronously and record history."""
        record = {
            "id": "run_" + uuid.uuid4().hex[:12],
            "task_id": task["id"],
            "task_name": task["name"],
            "prompt": task["prompt"],
            "model": task.get("model", "qwen3-max"),
            "mode": task.get("mode", "ask"),
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "status": "running",
            "result": "",
            "error": None,
        }
        self._history.insert(0, record)
        # Keep only last 200 records
        self._history = self._history[:200]
        self._save_history()
        return record

    def complete_task_run(self, run_id: str, result: str, error: Optional[str] = None):
        for r in self._history:
            if r["id"] == run_id:
                r["finished_at"] = datetime.now().isoformat()
                r["status"] = "error" if error else "success"
                r["result"] = result
                r["error"] = error
                self._save_history()
                break

    def get_history(self, limit: int = 50) -> list[dict]:
        return self._history[:limit]

    def get_task_history(self, task_id: str, limit: int = 20) -> list[dict]:
        return [r for r in self._history if r["task_id"] == task_id][:limit]

    def reset_to_presets(self) -> list[dict]:
        self._tasks = self._get_default_tasks()
        self._save_tasks()
        return self._tasks


def get_scheduler_service() -> SchedulerService:
    return SchedulerService.get_instance()
