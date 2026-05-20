# Agent Hub — AI Agent Development Platform

A production-ready **AI Agent Development Platform** powered by FastAPI and Alibaba Cloud Qwen (OpenAI-compatible API). The agent can write code, execute shell commands, browse files, search content, and more — all streamed in real-time via Server-Sent Events (SSE).

---

## Features

### Core Agent
- **Streaming AI responses** via SSE — tokens appear instantly
- **Multi-turn conversation memory** with context injection
- **Tool execution loop** — agent decides when to call tools, results stream back
- **Thinking process display** — Qwen's reasoning shown in real-time
- **Code block rendering** — syntax highlighted, with copy/run buttons

### Skills System
- **6 built-in skills** (Code Development, Python Expert, Web Dev, Terminal Master, Code Review, Quick Fix)
- **Custom skills** — define trigger keywords, system prompt additions, and allowed tools
- **Auto-matching** — agent automatically selects the best skill based on message content
- Skill categories, icons, and tag support

### Knowledge Base
- **Reference documents** — create, edit, search, delete knowledge entries
- **Auto-injected** into agent prompts as contextual reference
- Category and tag filtering
- Full-text search across title, content, and tags

### Memory
- **Short-term** (current session) and **long-term** (persistent) memory
- Manual memory creation with type classification (knowledge, preference, session)
- Configurable token threshold and extraction interval

### Workspace
- **File browser** — tree view with collapsible folders
- **Built-in editor** — syntax highlighting, file metadata, modified status
- **File operations** — create, read, write, delete, upload
- Path sandboxing for security

### Management Pages
- **Dashboard** — stats, quick actions, system status, recent conversations
- **Resource Management** — variables, secrets, API keys with copy/delete
- **Agent Center** — manage custom AI agents with toggle enable/disable
- **Deployment & Ops** — quick deploy templates, deployment history logs
- **Documents & Reports** — markdown documents, categorization
- **Monitoring Panel** — token/response charts, agent activity, system resources

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Create or edit `.env` in the project root:

```env
# Alibaba Cloud DashScope (International) — recommended for Qwen3-Max
DASHSCOPE_API_KEY=your-dashscope-api-key
API_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
DEFAULT_MODEL=qwen3-max

# Or use OpenAI-compatible endpoint
OPENAI_API_KEY=your-openai-key
API_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4o

# Workspace directory (relative to project root)
WORKSPACE_DIR=./workspace
```

> **Note:** If you prefer not to use `.env`, you can also set your API Key directly in the Settings page (`/settings`) after starting the app — it saves to `app/data/config.json`.

### 3. Start the Server

```bash
python main.py
```

Open your browser at **http://localhost:8000**

---

## Project Structure

```
├── main.py                      # FastAPI entry point, routes, middleware
├── requirements.txt             # Python dependencies
├── .env                         # Environment variables
├── DESIGN.md                      # Design documentation (product roadmap)
├── app/
│   ├── core/
│   │   ├── config.py           # Settings singleton (reads .env)
│   │   └── schemas.py         # Pydantic models
│   ├── api/                    # FastAPI route modules
│   │   ├── chat.py           # SSE streaming chat
│   │   ├── skills.py         # Skills CRUD + auto-match
│   │   ├── workspace.py      # File operations
│   │   ├── memory.py        # Memory management
│   │   ├── knowledge.py      # Knowledge base CRUD
│   │   ├── config.py        # Config + models API
│   │   ├── agents_api.py    # Agent management
│   │   └── deploy.py        # Resources + deploy logs
│   ├── service/
│   │   ├── agent_service.py  # Orchestrates chat + skills + KB
│   │   ├── skill_service.py  # Builtin + custom skills
│   │   ├── memory_service.py # Memory CRUD
│   │   ├── knowledge_service.py
│   │   ├── workspace_service.py
│   │   └── config_service.py # JSON-persisted config
│   ├── agent/
│   │   ├── loop.py          # AgentLoop: streaming LLM + tool iteration
│   │   ├── executor.py      # ToolExecutor
│   │   └── tools.py         # OpenAI tool format converter
│   ├── tools/
│   │   ├── registry.py      # ToolRegistry (6 built-in tools)
│   │   ├── base.py         # BaseTool ABC
│   │   ├── file_tool.py    # ReadTool, WriteTool, EditTool
│   │   ├── bash_tool.py    # BashTool (allowlist/blocklist security)
│   │   └── search_tool.py  # GlobTool, GrepTool
│   └── web/
│       ├── view/            # 13 HTML pages
│       ├── js/              # 10 JavaScript files
│       └── css/             # Stylesheets
```

---

## API Reference

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat/stream` | SSE streaming chat |
| `POST` | `/api/chat/` | Non-streaming chat |

**Chat Request Body:**
```json
{
  "message": "Write a Python function",
  "conversation_id": null,
  "skill_id": null,
  "enable_tools": true,
  "model": "qwen3-max",
  "knowledge_bases": ["kb-001"]
}
```

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/skills` | List all skills |
| `GET` | `/api/skills/match?message=...` | Auto-match skill |
| `POST` | `/api/skills` | Create custom skill |
| `PATCH` | `/api/skills/{id}/toggle` | Enable/disable skill |
| `PUT` | `/api/skills/{id}` | Update skill |
| `DELETE` | `/api/skills/{id}` | Delete skill |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/knowledge` | List all entries |
| `GET` | `/api/knowledge/search?query=...` | Search entries |
| `POST` | `/api/knowledge` | Create entry |
| `PUT` | `/api/knowledge/{id}` | Update entry |
| `DELETE` | `/api/knowledge/{id}` | Delete entry |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/memories` | List memories |
| `GET` | `/api/memories/search?query=...` | Search |
| `POST` | `/api/memories` | Create memory |
| `DELETE` | `/api/memories/{id}` | Delete memory |

### Workspace

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workspace/files` | List files |
| `GET` | `/api/workspace/files/{path}` | Read file |
| `POST` | `/api/workspace/files` | Create file |
| `PUT` | `/api/workspace/files/{path}` | Update file |
| `DELETE` | `/api/workspace/files/{path}` | Delete file |

### Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Get config |
| `POST` | `/api/config` | Update config |
| `GET` | `/api/config/models` | Available models |
| `POST` | `/api/config/api-key` | Save API key |

---

## Built-in Tools

| Tool | Description | Safety |
|------|-------------|--------|
| `Read` | Read any file in workspace | Path sandboxed |
| `Write` | Create or overwrite a file | — |
| `Edit` | Precise string replacement in a file | — |
| `Bash` | Execute shell commands | Allowlist + blocklist filter |
| `Glob` | Find files by pattern | — |
| `Grep` | Regex search across files | — |

---

## Available Models

The platform ships with these pre-configured models:

| Model ID | Provider |
|----------|----------|
| `qwen3-max` | Alibaba Cloud (recommended) |
| `qwen3-plus` | Alibaba Cloud |
| `qwen3` | Alibaba Cloud |
| `qwen-plus` | Alibaba Cloud |
| `qwen-turbo` | Alibaba Cloud |
| `gpt-4o` | OpenAI |
| `gpt-4o-mini` | OpenAI |
| `gpt-4-turbo` | OpenAI |
| `claude-3-5-sonnet` | Anthropic |
| `claude-3-opus` | Anthropic |

To use **Qwen3-Max International**, ensure your `.env` contains:

```env
DASHSCOPE_API_KEY=your-key
API_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
DEFAULT_MODEL=qwen3-max
```

---

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Chat | Root redirects to `/chat` — main chat interface |
| `/dashboard` | Dashboard | Overview with stats and quick actions |
| `/chat` | Chat | Main AI chat interface (Execution / Memory / Workspace panels) |
| `/index` | Management Console | Quick access to all management tools |
| `/skills` | Skill Center | Manage AI agent skills |
| `/knowledge` | Knowledge Base | Reference documents |
| `/workspace` | Workspace | File browser and editor |
| `/agents` | Agent Center | Manage AI agents |
| `/settings` | Settings | API config, theme, data |
| `/resources` | Resources | Variables, secrets, API keys |
| `/deploy` | Deploy & Ops | Deployment templates and logs |
| `/docs` | Documents | Reports and guides |
| `/monitoring` | Monitoring | Metrics and system status |

---

## Data Persistence

All data is stored as JSON files in `app/data/`:

| File | Data |
|------|------|
| `config.json` | API key, base URL, model, theme, username |
| `skills.json` | Custom skills |
| `knowledge_base.json` | Knowledge entries |
| `memories.json` | Memory items |
| `memory_config.json` | Memory settings |
| `agents.json` | Custom agents |
| `resources.json` | Variables, secrets, API keys |
| `deploy_logs.json` | Deployment history |

---

## Security

- **Workspace sandboxing** — all file operations are resolved inside `./workspace/`
- **Bash allowlist/blocklist** — shell commands filtered by configurable lists
- **API key masking** — keys returned from API are masked (`sk-xxxx****xxxx`)
- **Session authentication** — localStorage-based session check on page load
