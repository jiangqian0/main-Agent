from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="Engineer Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import chat, skills, workspace, memory, knowledge, config, agents_api, deploy

app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(skills.router, prefix="/api/skills", tags=["Skills"])
app.include_router(workspace.router, prefix="/api/workspace", tags=["Workspace"])
app.include_router(memory.router, prefix="/api/memories", tags=["Memory"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(agents_api.router, prefix="/api/agents", tags=["Agents"])
app.include_router(deploy.router, prefix="/api/system", tags=["System"])

app.mount("/static", StaticFiles(directory="app/web"), name="static")


def read_html(filename: str) -> str:
    """读取 HTML 文件"""
    path = f"app/web/view/{filename}"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


# Page Routes
@app.get("/", response_class=HTMLResponse)
async def root():
    """根路径重定向到 dashboard"""
    return RedirectResponse(url="/dashboard")


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """登录页面"""
    return read_html("login.html")


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page():
    """Dashboard 页面"""
    return read_html("dashboard.html")


@app.get("/chat", response_class=HTMLResponse)
async def chat_page():
    """聊天页面"""
    return read_html("chat.html")


@app.get("/skills", response_class=HTMLResponse)
async def skills_page():
    """技能中心页面"""
    return read_html("skills.html")


@app.get("/workspace", response_class=HTMLResponse)
async def workspace_page():
    """工作区页面"""
    return read_html("workspace.html")


@app.get("/settings", response_class=HTMLResponse)
async def settings_page():
    """设置页面"""
    return read_html("settings.html")


# Placeholder routes for future pages
@app.get("/resources", response_class=HTMLResponse)
async def resources_page():
    """资源管理页面"""
    return read_html("resources.html")


@app.get("/deploy", response_class=HTMLResponse)
async def deploy_page():
    """部署页面"""
    return read_html("deploy.html")


@app.get("/knowledge", response_class=HTMLResponse)
async def knowledge_page():
    """知识库页面"""
    return read_html("knowledge.html")


@app.get("/agents", response_class=HTMLResponse)
async def agents_page():
    """Agent 中心页面"""
    return read_html("agents.html")


@app.get("/docs", response_class=HTMLResponse)
async def docs_page():
    """Documents & Reports 页面"""
    return read_html("docs.html")


@app.get("/monitoring", response_class=HTMLResponse)
async def monitoring_page():
    """Monitoring Panel 页面"""
    return read_html("monitoring.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
