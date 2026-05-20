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
                "name": "代码审查提醒",
                "description": "每天定时提醒团队进行代码审查，确保代码质量。",
                "prompt": "请生成一份代码审查清单，包含以下内容：\n1. 代码可读性检查点\n2. 安全性检查项\n3. 性能优化建议\n4. 最佳实践检查\n\n请以结构化的 Markdown 格式输出，方便团队使用。",
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
                "name": "每日站会摘要",
                "description": "每天早上生成项目进展摘要，帮助团队快速了解状态。",
                "prompt": "请根据以下信息生成一份简短的每日站会摘要（3句话以内）：\n1. 昨天的进展\n2. 今天计划\n3. 遇到的阻碍\n\n请用清晰的项目符号列出。",
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
                "name": "Bug 报告整理",
                "description": "定时扫描已知 Bug 并生成优先级报告。",
                "prompt": "请分析以下 Bug 列表，按严重程度和影响范围排序，给出修复优先级建议：\n1. P0（系统崩溃/数据丢失）\n2. P1（核心功能不可用）\n3. P2（次要功能受损）\n4. P3（体验问题）\n\n输出格式：表格 + 简短说明。",
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
                "name": "部署前检查清单",
                "description": "在每次定时检查时间提醒团队执行部署前检查。",
                "prompt": "请生成部署前检查清单，包含：\n1. 数据库迁移检查\n2. 配置环境变量验证\n3. 依赖版本确认\n4. 回滚方案准备\n5. 监控告警确认\n\n请添加每一项的简要说明。",
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
                "name": "每周工作总结",
                "description": "每周五生成一周工作总结和下周计划草稿。",
                "prompt": "请根据以下内容生成一份每周工作总结：\n1. 本周完成的主要任务\n2. 关键指标达成情况\n3. 遇到的问题及解决方案\n4. 下周工作计划（按优先级排列）\n\n请使用专业的项目管理格式。",
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
