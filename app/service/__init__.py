from app.core.config import settings, WORKSPACE_DIR

def get_tools_description() -> str:
    """获取工具描述（用于Agent）"""
    tools = [
        {
            "name": "write_file",
            "description": "Write content to a file in the workspace",
            "parameters": {
                "file_path": {"type": "string", "description": "The path of the file to write"},
                "content": {"type": "string", "description": "The content to write"}
            }
        },
        {
            "name": "read_file",
            "description": "Read content from a file in the workspace",
            "parameters": {
                "file_path": {"type": "string", "description": "The path of the file to read"}
            }
        },
        {
            "name": "list_files",
            "description": "List all files in the workspace",
            "parameters": {}
        }
    ]
    return str(tools)