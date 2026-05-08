import json
import os
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
        self._data_dir = Path("app/data")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._skills_file = self._data_dir / "skills.json"
        self._builtin_tools_file = self._data_dir / "builtin_tools.json"
        self._skills: List[Skill] = []
        self._builtin_tools: List[Dict[str, Any]] = []
        self._register_builtin_skills()
        self._register_builtin_tools()
        self._load_custom_skills()

    # ── 内置 Skill 定义 ──────────────────────────────────────

    def _register_builtin_skills(self):
        """注册内置 Skill（不可删除）"""
        self._builtin_skills = [
            Skill(
                id="builtin-code-dev",
                name="Code Development",
                description="Full-featured coding assistant with file operations, terminal access, and code search capabilities. Best for building applications, writing scripts, and debugging.",
                enabled=True,
                category="Core",
                version="1.0.0",
                icon="fa-code",
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
            ),
            Skill(
                id="builtin-python-expert",
                name="Python Expert",
                description="Specialized in Python development including data analysis, automation scripts, web frameworks, and API integration. Strong in pandas, FastAPI, Flask, and async programming.",
                enabled=False,
                category="Language",
                version="1.0.0",
                icon="fa-brands fa-python",
                is_builtin=True,
                trigger_keywords=["python", "pandas", "flask", "fastapi", "django", "数据处理", "自动化"],
                system_prompt_addition="""你是一个 Python 专家。当处理 Python 相关任务时：
- 熟练使用 dataclasses、pydantic、typing 等类型系统
- 优先使用 async/await 进行异步编程
- 熟悉 FastAPI、Flask、pandas、numpy 等常用库
- 使用 pathlib 处理文件路径
- 编写符合 PEP 8 规范的代码
- 对于数据处理任务，优先使用 pandas 和 numpy""",
                allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                tags=["python", "backend", "data"]
            ),
            Skill(
                id="builtin-web-dev",
                name="Web Development",
                description="Frontend and full-stack web development specialist. Proficient in HTML, CSS, JavaScript, TypeScript, React, Next.js, and modern web APIs. Can build responsive UIs and integrate with backends.",
                enabled=False,
                category="Specialized",
                version="1.0.0",
                icon="fa-globe",
                is_builtin=True,
                trigger_keywords=["网页", "前端", "html", "css", "javascript", "react", "next", "website", "web", "界面", "UI"],
                system_prompt_addition="""你是一个全栈 Web 开发专家。当处理 Web 开发任务时：
- 使用 Write 工具创建 HTML/CSS/JS/TSX 文件
- 使用 Edit 工具修改现有 Web 文件
- 使用 Bash 工具运行 npm/pnpm/yarn 命令
- 遵循语义化 HTML 和响应式设计原则
- 使用现代 CSS（Flexbox/Grid/CSS Variables）
- 对于 React/Next.js 项目，确保组件结构清晰""",
                allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                tags=["frontend", "web", "html", "css", "react"]
            ),
            Skill(
                id="builtin-terminal-master",
                name="Terminal Master",
                description="Advanced shell command expert. Proficient in bash/powershell commands, git workflows, Docker operations, server management, and CI/CD pipelines.",
                enabled=False,
                category="DevOps",
                version="1.0.0",
                icon="fa-terminal",
                is_builtin=True,
                trigger_keywords=["终端", "命令行", "shell", "git", "docker", "部署", "服务器", "pipeline", "bash", "command"],
                system_prompt_addition="""你是一个终端和 DevOps 专家。当需要执行命令时：
- 优先使用 Bash 工具执行终端命令
- 提供清晰的风险提示（破坏性操作需明确说明）
- 使用 --dry-run 或 -n 参数预览危险命令
- 解释每个命令的作用而非盲目执行
- 对于 Git 操作，说明操作的影响
- 对于 Docker，优先使用 docker-compose 编排多容器服务""",
                allowed_tools=["Read", "Bash", "Glob", "Grep"],
                tags=["devops", "terminal", "git", "docker", "shell"]
            ),
            Skill(
                id="builtin-code-review",
                name="Code Review",
                description="Performs thorough code reviews for code quality, security vulnerabilities, performance issues, and best practice violations. Provides actionable improvement suggestions.",
                enabled=False,
                category="Quality",
                version="1.0.0",
                icon="fa-magnifying-glass",
                is_builtin=True,
                trigger_keywords=["review", "审查", "检查代码", "代码审查", "优化", "性能", "bug", "security"],
                system_prompt_addition="""你是一个专业的代码审查专家。当进行代码审查时：
- 使用 Read 工具读取完整代码文件
- 使用 Grep 工具搜索潜在问题模式
- 重点检查：安全性、性能、可读性、错误处理
- 给出具体的改进建议和代码示例
- 标注问题严重程度（Critical/Major/Minor）
- 不批评代码风格，以功能性建议为主""",
                allowed_tools=["Read", "Grep", "Glob"],
                tags=["review", "quality", "security", "analysis"]
            ),
            Skill(
                id="builtin-quick-fix",
                name="Quick Fix",
                description="Fast problem diagnosis and bug fixing mode. Directly reads files, identifies issues, and applies minimal targeted fixes. Minimal talking, maximum action.",
                enabled=False,
                category="Core",
                version="1.0.0",
                icon="fa-wand-magic-sparkles",
                is_builtin=True,
                trigger_keywords=["修复", "fix", "bug", "报错", "错误", "不工作", "broken", "error", "issue"],
                system_prompt_addition="""你是快速修复专家。使用最小改动原则修复问题：
- 快速定位问题：使用 Grep 搜索错误信息，使用 Read 读取相关文件
- 直接修复：使用 Edit 工具做精确的小范围修改
- 验证修复：使用 Bash 运行测试或验证命令
- 不重写整个文件，只修改必要的部分
- 简洁回复，说明修复了什么以及为什么""",
                allowed_tools=["Read", "Edit", "Bash", "Grep"],
                tags=["fix", "bug", "debug", "quick"]
            ),
        ]
        self._all_skills = list(self._builtin_skills)

    # ── 内置工具定义 ──────────────────────────────────────

    def _register_builtin_tools(self):
        """注册内置工具定义（用于前端展示）"""
        self._builtin_tools = [
            {
                "name": "Read",
                "icon": "fa-book-open",
                "description": "Read the contents of a file or directory listing",
                "category": "File",
                "builtin": True
            },
            {
                "name": "Write",
                "icon": "fa-file-circle-plus",
                "description": "Create a new file or overwrite an existing file",
                "category": "File",
                "builtin": True
            },
            {
                "name": "Edit",
                "icon": "fa-pen",
                "description": "Edit a specific section of an existing file (precise changes only)",
                "category": "File",
                "builtin": True
            },
            {
                "name": "Bash",
                "icon": "fa-terminal",
                "description": "Execute shell commands (npm, git, python, docker, etc.)",
                "category": "System",
                "builtin": True
            },
            {
                "name": "Glob",
                "icon": "fa-folder-tree",
                "description": "Find files matching a pattern or list directory contents",
                "category": "Search",
                "builtin": True
            },
            {
                "name": "Grep",
                "icon": "fa-magnifying-glass",
                "description": "Search for text patterns within files using regex",
                "category": "Search",
                "builtin": True
            },
        ]

    # ── 持久化 ───────────────────────────────────────────

    def _load_custom_skills(self):
        """从文件加载自定义 Skill"""
        if self._skills_file.exists():
            try:
                with open(self._skills_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    custom = [Skill(**s) for s in data.get("skills", [])]
                    self._skills = custom
                    self._all_skills = list(self._builtin_skills) + custom
            except (json.JSONDecodeError, Exception):
                self._skills = []
                self._all_skills = list(self._builtin_skills)
        else:
            self._skills = []
            self._all_skills = list(self._builtin_skills)

    def _save_custom_skills(self):
        """保存自定义 Skill 到文件"""
        data = {"skills": [s.model_dump() for s in self._skills]}
        with open(self._skills_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ── 对外接口 ─────────────────────────────────────────

    def get_all_skills(self) -> List[Skill]:
        """获取所有 Skill（含内置 + 自定义）"""
        return self._all_skills

    def get_enabled_skills(self) -> List[Skill]:
        """获取所有已启用的 Skill"""
        return [s for s in self._all_skills if s.enabled]

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """根据 ID 获取 Skill"""
        return next((s for s in self._all_skills if s.id == skill_id), None)

    def get_skills_by_category(self) -> Dict[str, List[Skill]]:
        """按分类分组获取所有 Skill"""
        result: Dict[str, List[Skill]] = {}
        for s in self._all_skills:
            result.setdefault(s.category, []).append(s)
        return result

    def create_skill(self, skill_data: SkillCreate) -> Skill:
        """创建自定义 Skill"""
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
        self._skills.append(skill)
        self._all_skills.append(skill)
        self._save_custom_skills()
        return skill

    def update_skill(self, skill_id: str, skill_data: Skill) -> Optional[Skill]:
        """更新 Skill（内置 Skill 只能改 enabled）"""
        for i, s in enumerate(self._all_skills):
            if s.id == skill_id:
                if s.is_builtin:
                    # 内置 Skill 只允许修改 enabled
                    s.enabled = skill_data.enabled
                    return s
                # 自定义 Skill 全量更新
                self._all_skills[i] = skill_data
                for j, cs in enumerate(self._skills):
                    if cs.id == skill_id:
                        self._skills[j] = skill_data
                        break
                self._save_custom_skills()
                return skill_data
        return None

    def toggle_skill(self, skill_id: str) -> Optional[Skill]:
        """切换 Skill 启用状态"""
        skill = self.get_skill(skill_id)
        if skill:
            skill.enabled = not skill.enabled
            for i, s in enumerate(self._skills):
                if s.id == skill_id:
                    self._skills[i].enabled = skill.enabled
                    break
            self._save_custom_skills()
            return skill
        return None

    def delete_skill(self, skill_id: str) -> bool:
        """删除自定义 Skill（内置不可删）"""
        skill = self.get_skill(skill_id)
        if not skill or skill.is_builtin:
            return False
        self._skills = [s for s in self._skills if s.id != skill_id]
        self._all_skills = [s for s in self._all_skills if s.id != skill_id]
        self._save_custom_skills()
        return True

    def get_builtin_tools(self) -> List[Dict[str, Any]]:
        """获取内置工具定义"""
        return self._builtin_tools

    def get_skill_system_prompt(self, skill_id: str) -> tuple[str, List[str]]:
        """
        获取指定 Skill 的追加提示词和允许工具列表。
        返回 (system_prompt_addition, allowed_tools)
        如果 skill_id 为 None，返回空字符串和空列表（使用默认全部工具）
        """
        if not skill_id:
            return "", []
        skill = self.get_skill(skill_id)
        if not skill or not skill.enabled:
            return "", []
        return skill.system_prompt_addition, skill.allowed_tools

    def match_skill_by_message(self, message: str) -> Optional[Skill]:
        """
        根据消息内容智能匹配最合适的 Skill。
        检查 trigger_keywords，返回第一个命中的 enabled Skill。
        """
        msg_lower = message.lower()
        for skill in self._all_skills:
            if not skill.enabled:
                continue
            for keyword in skill.trigger_keywords:
                if keyword.lower() in msg_lower:
                    return skill
        return None


def get_skill_service() -> SkillService:
    return SkillService()
