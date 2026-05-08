from typing import Dict, List, Any

from app.tools.registry import get_registry


def convert_to_openai_tools(tools: List[Dict]) -> List[Dict]:
    if not tools:
        return []
    openai_tools = []
    for tool in tools:
        if tool.get("type") == "function" and "function" in tool:
            openai_tools.append(tool)
        elif "name" in tool:
            openai_tool = {
                "type": "function",
                "function": {
                    "name": tool.get("name"),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {"type": "object"})
                }
            }
            openai_tools.append(openai_tool)
        else:
            openai_tools.append(tool)
    return openai_tools
