from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from dotenv import load_dotenv
import json
import os
import pathlib

load_dotenv()

DEFAULT_ROOT_PATH = "/alicloud-main-agent/web"
ROOT_PATH = os.getenv("ROOT_PATH", DEFAULT_ROOT_PATH).rstrip("/")
API_BASE_URL = os.getenv("FRONTEND_API_BASE_URL", "/api").rstrip("/")


def prefix_path(path: str, prefix: str = ROOT_PATH) -> str:
    if not path.startswith("/"):
        path = f"/{path}"

    normalized_prefix = prefix.rstrip("/")
    if not normalized_prefix:
        return path

    if path == normalized_prefix or path.startswith(f"{normalized_prefix}/"):
        return path

    return f"{normalized_prefix}{path}"


def build_runtime_prefix_script() -> str:
    config = {
        "rootPath": ROOT_PATH,
        "apiBaseUrl": API_BASE_URL,
    }
    return f"""
<script>
(function() {{
    const config = Object.assign({json.dumps(config)}, window.APP_CONFIG || {{}});
    const trimTrailingSlash = (value) => value && value !== '/' ? value.replace(/\\/+$/, '') : (value || '');
    const rootPath = trimTrailingSlash(config.rootPath || '');
    const apiBaseUrl = trimTrailingSlash(config.apiBaseUrl || '');
    const absoluteUrlPattern = /^(?:[a-z][a-z\\d+\\-.]*:)?\\/\\//i;
    const skipPattern = /^(?:#|mailto:|tel:|javascript:|data:)/i;

    function withPrefix(value, prefix) {{
        if (typeof value !== 'string' || !value.startsWith('/')) {{
            return value;
        }}

        const normalizedPrefix = trimTrailingSlash(prefix || '');
        if (!normalizedPrefix) {{
            return value;
        }}

        if (value === normalizedPrefix || value.startsWith(normalizedPrefix + '/')) {{
            return value;
        }}

        return normalizedPrefix + value;
    }}

    function prefixPath(value) {{
        if (!value || absoluteUrlPattern.test(value) || skipPattern.test(value)) {{
            return value;
        }}

        return withPrefix(value, rootPath);
    }}

    function prefixApiPath(value) {{
        if (!value || absoluteUrlPattern.test(value) || skipPattern.test(value)) {{
            return value;
        }}

        return prefixPath(value);
    }}

    window.APP_CONFIG = config;
    window.prefixPath = prefixPath;
    window.prefixApiPath = prefixApiPath;
    window.navigateTo = function(value) {{
        window.location.assign(prefixPath(value));
    }};

    const originalFetch = window.fetch.bind(window);
    window.fetch = function(resource, init) {{
        if (typeof resource === 'string') {{
            return originalFetch(prefixApiPath(resource), init);
        }}

        if (resource instanceof URL) {{
            return originalFetch(prefixApiPath(resource.toString()), init);
        }}

        return originalFetch(resource, init);
    }};

    function rewriteAttribute(element, attribute, prefixer) {{
        const value = element.getAttribute(attribute);
        if (!value) {{
            return;
        }}

        const updated = prefixer(value);
        if (updated !== value) {{
            element.setAttribute(attribute, updated);
        }}
    }}

    function rewriteOnclick(element) {{
        const value = element.getAttribute('onclick');
        if (!value) {{
            return;
        }}

        const updated = value.replace(/window\\.location\\.href\\s*=\\s*(['\"])(\\/[^'\"]*)\\1/g, function(_, quote, path) {{
            return 'window.navigateTo(' + quote + path + quote + ')';
        }});

        if (updated !== value) {{
            element.setAttribute('onclick', updated);
        }}
    }}

    function rewriteDom() {{
        document.querySelectorAll('a[href], link[href]').forEach((element) => rewriteAttribute(element, 'href', prefixPath));
        document.querySelectorAll('script[src], img[src]').forEach((element) => rewriteAttribute(element, 'src', prefixPath));
        document.querySelectorAll('form[action]').forEach((element) => rewriteAttribute(element, 'action', prefixPath));
        document.querySelectorAll('[onclick]').forEach(rewriteOnclick);
    }}

    if (document.readyState === 'loading') {{
        document.addEventListener('DOMContentLoaded', rewriteDom);
    }} else {{
        rewriteDom();
    }}
}})();
</script>
""".strip()


def inject_runtime_prefix(html: str) -> str:
    runtime_script = build_runtime_prefix_script()
    static_prefix = prefix_path("/static")
    html = html.replace(f"{DEFAULT_ROOT_PATH}/static", static_prefix)

    if "</head>" in html:
        return html.replace("</head>", f"    {runtime_script}\n</head>", 1)

    return f"{runtime_script}\n{html}"


class PrefixPathMiddleware:
    def __init__(self, app, root_path: str):
        self.app = app
        self.root_path = root_path.rstrip("/")

    async def __call__(self, scope, receive, send):
        if self.root_path and scope.get("type") in {"http", "websocket"}:
            path = scope.get("path", "")
            if path == self.root_path or path.startswith(f"{self.root_path}/"):
                stripped_path = path[len(self.root_path):] or "/"
                updated_scope = dict(scope)
                updated_scope["path"] = stripped_path
                updated_scope["root_path"] = self.root_path
                if scope.get("raw_path"):
                    updated_scope["raw_path"] = stripped_path.encode("utf-8")

                # Trust X-Forwarded-Proto to fix scheme for redirect URLs
                for header_name, header_value in scope.get("headers", []):
                    if header_name == b"x-forwarded-proto":
                        updated_scope["scheme"] = header_value.decode("latin-1").split(",")[0].strip()
                        break

                scope = updated_scope

                # Intercept redirect responses to fix Location header
                async def send_with_fixed_redirects(message):
                    if message["type"] == "http.response.start":
                        status = message.get("status", 200)
                        if 300 <= status < 400:
                            headers = []
                            for key, value in message.get("headers", []):
                                if key.lower() == b"location":
                                    location = value.decode("latin-1")
                                    location = self._fix_location(location)
                                    value = location.encode("latin-1")
                                headers.append((key, value))
                            message = {**message, "headers": headers}
                    await send(message)

                await self.app(scope, receive, send_with_fixed_redirects)
                return

        await self.app(scope, receive, send)

    def _fix_location(self, location: str) -> str:
        """Convert redirect Location to relative path with correct prefix."""
        from urllib.parse import urlparse
        parsed = urlparse(location)
        path = parsed.path or "/"

        # Add prefix if not already present
        if not path.startswith(self.root_path):
            path = self.root_path + path

        # Return as relative path (strip scheme/host to avoid mixed-content)
        result = path
        if parsed.query:
            result += "?" + parsed.query
        if parsed.fragment:
            result += "#" + parsed.fragment
        return result


from app.api import chat, skills, memory, knowledge, config, agents_api, deploy, scheduler_api, workspace
from app.api import auth, conversations
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.database import init_db
    await init_db()
    yield

app = FastAPI(title="Alicloud Agent", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"[422 VALIDATION ERROR] path={request.url.path} body={exc.body}")
    print(f"[422] errors={exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(conversations.router)

app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(skills.router, prefix="/api/skills", tags=["Skills"])
app.include_router(memory.router, prefix="/api/memories", tags=["Memory"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(agents_api.router, prefix="/api/agents", tags=["Agents"])
app.include_router(deploy.router, prefix="/api/system", tags=["System"])
app.include_router(scheduler_api.router, prefix="/api/scheduler", tags=["Scheduler"])
app.include_router(workspace.router, prefix="/api/workspace", tags=["Workspace"])

STATIC_DIR = pathlib.Path(__file__).resolve().parent / "app" / "web"


def read_html(filename: str) -> str:
    """读取 HTML 文件"""
    path = f"app/web/view/{filename}"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return inject_runtime_prefix(f.read())
    return ""


# Page Routes
@app.get("/", response_class=HTMLResponse)
async def root():
    """根路径重定向到 dashboard"""
    return RedirectResponse(url=prefix_path("/dashboard"))

@app.get("/index", response_class=HTMLResponse)
async def index_page():
    """管理控制台页面"""
    return read_html("index.html")

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


@app.get("/api/v1/health/live")
async def health_live():
    """健康检查接口 - K8s liveness/readiness probe"""
    return {"status": "ok"}


@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    full_path = (STATIC_DIR / file_path).resolve()
    if not str(full_path).startswith(str(STATIC_DIR)):
        raise HTTPException(status_code=404)
    if full_path.is_file():
        return FileResponse(full_path)
    raise HTTPException(status_code=404)


app = PrefixPathMiddleware(app, ROOT_PATH)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8081)
