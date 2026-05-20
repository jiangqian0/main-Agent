from pathlib import Path
from typing import Dict, List, Optional, Any
from .base import BaseTool, ToolResult


WORKSPACE_DIR = Path(__file__).parent.parent.parent / "workspace"
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)


class ReadTool(BaseTool):
    name = "Read"
    description = "读取文件内容。用于查看文件时使用。参数：file_path (文件路径)"
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "要读取的文件路径（相对于 workspace/ 的路径）"
            }
        },
        "required": ["file_path"]
    }

    async def execute(self, file_path: str, **kwargs) -> ToolResult:
        try:
            if file_path.startswith("workspace/") or file_path.startswith("workspace\\"):
                file_path = file_path[10:]
            if not Path(file_path).is_absolute():
                path = WORKSPACE_DIR / file_path
            else:
                path = Path(file_path)

            resolved = path.resolve()
            if not str(resolved).startswith(str(WORKSPACE_DIR.resolve())):
                return ToolResult(success=False, error=f"路径必须在工作空间内: {file_path}")

            if not path.exists():
                return ToolResult(success=False, error=f"文件不存在: {file_path}")
            if not path.is_file():
                return ToolResult(success=False, error=f"不是文件: {file_path}")

            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return ToolResult(success=True, result=content)
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class WriteTool(BaseTool):
    name = "Write"
    description = "创建或覆盖文件内容。参数：file_path (文件路径), content (文件内容)"
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "要写入的文件路径（相对于 workspace/ 的路径）"
            },
            "content": {
                "type": "string",
                "description": "文件内容"
            }
        },
        "required": ["file_path", "content"]
    }

    async def execute(self, file_path: str, content: str, **kwargs) -> ToolResult:
        try:
            if file_path.startswith("workspace/") or file_path.startswith("workspace\\"):
                file_path = file_path[10:]
            if not Path(file_path).is_absolute():
                path = WORKSPACE_DIR / file_path
            else:
                path = Path(file_path)

            resolved = path.resolve()
            if not str(resolved).startswith(str(WORKSPACE_DIR.resolve())):
                return ToolResult(success=False, error=f"路径必须在工作空间内: {file_path}")

            path.parent.mkdir(parents=True, exist_ok=True)

            lines = content.split('\n')
            preview_lines = min(50, len(lines))
            preview_content = '\n'.join(lines[:preview_lines])
            preview = {
                "file_path": file_path,
                "language": self._detect_language(file_path),
                "content": preview_content,
                "total_lines": len(lines),
                "truncated": len(lines) > 50
            }

            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            rel_path = str(path.relative_to(WORKSPACE_DIR))
            return ToolResult(
                success=True,
                result=f"文件已写入 workspace/{rel_path}",
                preview=preview
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def _detect_language(self, file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        lang_map = {
            '.py': 'python', '.js': 'javascript', '.jsx': 'jsx',
            '.ts': 'typescript', '.tsx': 'tsx', '.html': 'html',
            '.css': 'css', '.json': 'json', '.md': 'markdown',
            '.sql': 'sql', '.sh': 'bash', '.yaml': 'yaml',
            '.yml': 'yaml', '.xml': 'xml', '.go': 'go',
            '.rs': 'rust', '.java': 'java', '.cpp': 'cpp',
            '.c': 'c', '.rb': 'ruby', '.php': 'php',
        }
        return lang_map.get(ext, 'text')


class EditTool(BaseTool):
    name = "Edit"
    description = "编辑文件的部分内容。参数：file_path (文件路径), old_str (要替换的文本), new_str (新文本)"
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "要编辑的文件路径（相对于 workspace/ 的路径）"
            },
            "old_str": {
                "type": "string",
                "description": "要替换的原始文本（必须精确匹配）"
            },
            "new_str": {
                "type": "string",
                "description": "替换后的新文本"
            }
        },
        "required": ["file_path", "old_str", "new_str"]
    }

    async def execute(self, file_path: str, old_str: str, new_str: str, **kwargs) -> ToolResult:
        try:
            if file_path.startswith("workspace/") or file_path.startswith("workspace\\"):
                file_path = file_path[10:]
            if not Path(file_path).is_absolute():
                path = WORKSPACE_DIR / file_path
            else:
                path = Path(file_path)

            resolved = path.resolve()
            if not str(resolved).startswith(str(WORKSPACE_DIR.resolve())):
                return ToolResult(success=False, error=f"路径必须在工作空间内: {file_path}")

            if not path.exists():
                return ToolResult(success=False, error=f"文件不存在: {file_path}")

            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            if old_str not in content:
                return ToolResult(success=False, error=f"未找到要替换的文本")

            new_content = content.replace(old_str, new_str, 1)

            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)

            rel_path = str(path.relative_to(WORKSPACE_DIR))
            return ToolResult(success=True, result=f"文件已编辑: workspace/{rel_path}")
        except Exception as e:
            return ToolResult(success=False, error=str(e))
