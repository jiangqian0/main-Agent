import subprocess
import re
from .base import BaseTool, ToolResult


BLOCKED_PATTERNS = [
    r'rm\s+-rf\s+/', r'rm\s+-rf\s+\*', r'format\s+c:',
    r'dd\s+if=', r'mkfs\.', r':(){.*:&.*:}',
    r'curl\s+http://', r'wget\s+http://',
    r'sudo\s+su', r'chmod\s+777\s+/etc',
]

ALLOWED_COMMANDS = [
    'ls', 'dir', 'pwd', 'cd', 'mkdir', 'rmdir', 'cat', 'head', 'tail',
    'grep', 'find', 'wc', 'echo', 'type', 'tree', 'cp', 'mv',
    'npm', 'pip', 'python', 'python3', 'node', 'git', 'uvicorn', 'fastapi',
    'curl', 'wget',
]


class BashTool(BaseTool):
    name = "Bash"
    description = "执行 Bash/Shell 命令。参数：command (命令字符串)"
    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "要执行的命令（必须是安全命令）"
            }
        },
        "required": ["command"]
    }

    async def execute(self, command: str, **kwargs) -> ToolResult:
        try:
            for pattern in BLOCKED_PATTERNS:
                if re.search(pattern, command, re.IGNORECASE):
                    return ToolResult(success=False, error=f"命令被安全策略阻止: {command}")

            first_word = command.strip().split()[0] if command.strip() else ""
            if first_word and first_word not in ALLOWED_COMMANDS:
                if not any(cmd in command for cmd in ALLOWED_COMMANDS):
                    return ToolResult(success=False, error=f"命令不在允许列表中: {first_word}")

            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=60,
                encoding='utf-8',
                errors='replace'
            )

            output = result.stdout.strip() if result.stdout else result.stderr.strip()
            if not output:
                output = "(命令执行完成，无输出)"

            return ToolResult(
                success=(result.returncode == 0),
                result=output if result.returncode == 0 else f"[Error {result.returncode}] {output}"
            )
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, error="命令执行超时（60秒）")
        except Exception as e:
            return ToolResult(success=False, error=str(e))
