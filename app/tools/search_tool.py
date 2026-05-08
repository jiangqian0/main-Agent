import fnmatch
import re
from pathlib import Path
from .base import BaseTool, ToolResult


WORKSPACE_DIR = Path(__file__).parent.parent.parent / "workspace"
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)


class GlobTool(BaseTool):
    name = "Glob"
    description = "使用通配符搜索文件。参数：pattern (如 **/*.py)"
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "文件匹配模式（如 **/*.py, **/*.js）"
            }
        },
        "required": ["pattern"]
    }

    async def execute(self, pattern: str, **kwargs) -> ToolResult:
        try:
            files = []
            for f in WORKSPACE_DIR.rglob(pattern.replace("**/", "").replace("**", "*")):
                if f.is_file():
                    rel = str(f.relative_to(WORKSPACE_DIR))
                    files.append(rel)
            return ToolResult(success=True, result="\n".join(files) if files else "(无匹配文件)")
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class GrepTool(BaseTool):
    name = "Grep"
    description = "在文件中搜索文本。参数：pattern (正则表达式), file_path (可选，搜索范围)"
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "正则表达式搜索模式"
            },
            "file_path": {
                "type": "string",
                "description": "可选，搜索范围文件或目录"
            }
        },
        "required": ["pattern"]
    }

    async def execute(self, pattern: str, file_path: str = None, **kwargs) -> ToolResult:
        try:
            if file_path:
                if file_path.startswith("workspace/"):
                    file_path = WORKSPACE_DIR / file_path[10:]
                elif not Path(file_path).is_absolute():
                    file_path = WORKSPACE_DIR / file_path
            else:
                file_path = WORKSPACE_DIR

            path = Path(file_path)
            results = []
            for f in (path.rglob("*") if path.is_dir() else [path]):
                if f.is_file():
                    try:
                        with open(f, "r", encoding="utf-8", errors="ignore") as fp:
                            for i, line in enumerate(fp, 1):
                                if re.search(pattern, line):
                                    rel = str(f.relative_to(WORKSPACE_DIR))
                                    results.append(f"{rel}:{i}: {line.rstrip()}")
                    except Exception:
                        pass

            output = "\n".join(results[:50])
            return ToolResult(success=True, result=output if output else "(无匹配结果)")
        except Exception as e:
            return ToolResult(success=False, error=str(e))
