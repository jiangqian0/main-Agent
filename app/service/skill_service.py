import json
import os
import re
import yaml
from pathlib import Path
from typing import List, Dict, Optional, Any

from app.core.schemas import Skill, SkillCreate


class SkillService:
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

        self._skills_dir = Path(__file__).parent.parent / "skills"
        self._data_dir = Path("app/data")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._custom_skills_file = self._data_dir / "skills.json"

        self._builtin_tools: List[Dict[str, Any]] = []
        self._builtin_skills: List[Skill] = []
        self._custom_skills: List[Skill] = []
        self._all_skills: List[Skill] = []

        self._register_builtin_tools()
        self._load_builtin_skills_from_folders()
        self._load_custom_skills()
        self._rebuild_all()

    # ── Frontmatter parser ───────────────────────────────────────────────

    @staticmethod
    def _parse_skills_md(path: Path) -> tuple[Dict[str, Any], str]:
        """Parse a SKILL.md file. Returns (frontmatter_dict, markdown_body)."""
        raw = path.read_text(encoding="utf-8")
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.DOTALL)
        if m:
            fm = yaml.safe_load(m.group(1)) or {}
            body = m.group(2).strip()
        else:
            fm = {}
            body = raw.strip()
        return fm, body

    # ── Load built-in skills from folders ────────────────────────────────

    def _load_builtin_skills_from_folders(self):
        """Scan app/skills/ and load every skill-folder/SKILL.md."""
        self._builtin_skills = []
        if not self._skills_dir.is_dir():
            return

        for skill_dir in sorted(self._skills_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            md_path = skill_dir / "SKILL.md"
            if not md_path.exists():
                continue

            fm, body = self._parse_skills_md(md_path)

            skill = Skill(
                id=str(fm.get("name", skill_dir.name).lower().replace(" ", "-")),
                name=str(fm.get("name", skill_dir.name)),
                description=str(fm.get("description", "")),
                enabled=bool(fm.get("enabled", True)),
                category=str(fm.get("category", "Custom")),
                version=str(fm.get("version", "1.0.0")),
                icon=str(fm.get("icon", "fa-gear")),
                is_builtin=True,
                trigger_keywords=["写代码", "写个", "帮我写", "生成代码", "code", "build", "debug", "implement", "create file"],
                system_prompt_addition="""你是一个专业的代码开发助手。当用户需要编写代码时：
- 优先使用 Write 工具创建完整文件，确保代码可运行
- 使用 Read 工具查看现有代码上下文
- 使用 Edit 工具进行精确修改，不要重写整个文件
- 使用 Bash 工具执行命令（安装依赖、运行测试等）
- 使用 Glob/Grep 工具搜索代码和文件
- 生成代码时遵循最佳实践，包含必要的错误处理""",
                allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                tags=["coding", "development", "files", "terminal"]
            )
            self._builtin_skills.append(skill)

        # Builtin skills are now loaded from individual app/skills/*/SKILL.md folders.
        self._all_skills = list(self._builtin_skills)

    # ── 内置工具定义 ──────────────────────────────────────

    def _register_builtin_tools(self):
        self._builtin_tools = [
            {"name": "Read",   "icon": "fa-book-open",         "description": "Read the contents of a file or directory listing", "category": "File",   "builtin": True},
            {"name": "Write",  "icon": "fa-file-circle-plus",  "description": "Create a new file or overwrite an existing file",    "category": "File",   "builtin": True},
            {"name": "Edit",   "icon": "fa-pen",               "description": "Edit a specific section of an existing file",         "category": "File",   "builtin": True},
            {"name": "Bash",   "icon": "fa-terminal",          "description": "Execute shell commands (npm, git, python, docker …)", "category": "System", "builtin": True},
            {"name": "Glob",   "icon": "fa-folder-tree",       "description": "Find files matching a pattern or list a directory",   "category": "Search", "builtin": True},
            {"name": "Grep",   "icon": "fa-magnifying-glass",  "description": "Search for text patterns within files using regex",   "category": "Search", "builtin": True},
        ]

    # ── Custom skills (persisted JSON) ──────────────────────────────────

    def _load_custom_skills(self):
        if self._custom_skills_file.exists():
            try:
                data = json.loads(self._custom_skills_file.read_text(encoding="utf-8"))
                self._custom_skills = [Skill(**s) for s in data.get("skills", [])]
            except (json.JSONDecodeError, Exception):
                self._custom_skills = []
        else:
            self._custom_skills = []

    def _save_custom_skills(self):
        data = {"skills": [s.model_dump() for s in self._custom_skills]}
        self._custom_skills_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _rebuild_all(self):
        self._all_skills = list(self._builtin_skills) + list(self._custom_skills)

    # ── Public API ──────────────────────────────────────────────────────

    def get_all_skills(self) -> List[Skill]:
        return list(self._all_skills)

    def get_enabled_skills(self) -> List[Skill]:
        return [s for s in self._all_skills if s.enabled]

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        return next((s for s in self._all_skills if s.id == skill_id), None)

    def get_skills_by_category(self) -> Dict[str, List[Skill]]:
        result: Dict[str, List[Skill]] = {}
        for s in self._all_skills:
            result.setdefault(s.category, []).append(s)
        return result

    def create_skill(self, skill_data: SkillCreate) -> Skill:
        import uuid
        skill = Skill(
            id=f"custom-{uuid.uuid4().hex[:8]}",
            name=skill_data.name,
            description=skill_data.description,
            category=skill_data.category,
            version="1.0.0",
            icon=skill_data.icon,
            is_builtin=False,
            enabled=True,
            trigger_keywords=skill_data.trigger_keywords,
            system_prompt_addition=skill_data.system_prompt_addition,
            allowed_tools=skill_data.allowed_tools,
            tags=skill_data.tags,
        )
        self._custom_skills.append(skill)
        self._rebuild_all()
        self._save_custom_skills()
        return skill

    def update_skill(self, skill_id: str, skill_data: Skill) -> Optional[Skill]:
        for i, s in enumerate(self._all_skills):
            if s.id != skill_id:
                continue
            if s.is_builtin:
                s.enabled = skill_data.enabled
                return s
            self._custom_skills = [cs for cs in self._custom_skills if cs.id != skill_id]
            self._custom_skills.append(skill_data)
            self._rebuild_all()
            self._save_custom_skills()
            return skill_data
        return None

    def toggle_skill(self, skill_id: str) -> Optional[Skill]:
        skill = self.get_skill(skill_id)
        if not skill:
            return None
        skill.enabled = not skill.enabled
        for cs in self._custom_skills:
            if cs.id == skill_id:
                cs.enabled = skill.enabled
                break
        self._save_custom_skills()
        return skill

    def delete_skill(self, skill_id: str) -> bool:
        skill = self.get_skill(skill_id)
        if not skill or skill.is_builtin:
            return False
        self._custom_skills = [cs for cs in self._custom_skills if cs.id != skill_id]
        self._rebuild_all()
        self._save_custom_skills()
        return True

    def get_builtin_tools(self) -> List[Dict[str, Any]]:
        return list(self._builtin_tools)

    def get_skill_system_prompt(self, skill_id: str) -> tuple[str, List[str]]:
        if not skill_id:
            return "", []
        skill = self.get_skill(skill_id)
        if not skill or not skill.enabled:
            return "", []
        return skill.system_prompt_addition, skill.allowed_tools

    def match_skill_by_message(self, message: str) -> Optional[Skill]:
        msg_lower = message.lower()
        for skill in self._all_skills:
            if not skill.enabled:
                continue
            for keyword in skill.trigger_keywords:
                if keyword.lower() in msg_lower:
                    return skill
        return None

    def reload_builtin_skills(self):
        """Reload built-in skills from folders. Call after installing a new skill folder."""
        self._load_builtin_skills_from_folders()
        self._rebuild_all()


def get_skill_service() -> SkillService:
    return SkillService()
