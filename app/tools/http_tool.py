import json
import os
import httpx
from .base import BaseTool, ToolResult


class HttpRequestTool(BaseTool):
    name = "HttpRequest"
    description = "发送 HTTP 请求。支持 GET/POST/PUT/DELETE 方法，可发送 JSON 请求体。仅允许 HTTPS 请求。"
    input_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "请求 URL（必须是 https://）"
            },
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "DELETE"],
                "description": "HTTP 方法，默认 GET"
            },
            "body": {
                "type": "object",
                "description": "JSON 请求体（仅 POST/PUT 时使用）"
            },
            "headers": {
                "type": "object",
                "description": "额外的请求头"
            }
        },
        "required": ["url"]
    }

    # 允许调用的域名白名单
    ALLOWED_HOSTS = [
        "dev-api.gcr.manulife.com",
        "hkg-dev-api.gcr.manulife.com",
        # K8s 内部服务（同 namespace，Istio mTLS）
        "svc-alicloud-governance-agent.ns-hkg-alicloud-system",
        "svc-ets-alicloud-aiops-automation.ns-hkg-alicloud-system",
        "svc-ets-alicloud-aiops-security.ns-hkg-alicloud-system",
    ]

    def __init__(self):
        # 在初始化时快照所有代理环境变量（AgentLoop 会在调 LLM 前 pop 掉）
        self._proxy_url = (
            os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
            or ""
        )

    async def _do_request(self, url: str, method: str, data: dict,
                          req_headers: dict, use_proxy: bool) -> httpx.Response:
        """发送单次请求，use_proxy 控制是否走代理"""
        proxy = self._proxy_url if (use_proxy and self._proxy_url) else None
        async with httpx.AsyncClient(
            proxies={"https://": proxy, "http://": proxy} if proxy else None,
            timeout=30.0,
            follow_redirects=True,
            verify=True,
        ) as client:
            return await client.request(
                method=method,
                url=url,
                json=data if data and method in ("POST", "PUT") else None,
                headers=req_headers,
            )

    async def execute(self, url: str, method: str = "GET",
                      body: dict = None, headers: dict = None, **kwargs) -> ToolResult:
        try:
            # 安全检查：HTTPS 或 K8s 内部 HTTP
            is_internal = any(h in url for h in [
                ".ns-hkg-alicloud-system",
            ])
            if not url.startswith("https://") and not (url.startswith("http://") and is_internal):
                return ToolResult(success=False, error="仅允许 HTTPS 请求（K8s 内部服务允许 HTTP）")

            # 安全检查：域名白名单
            from urllib.parse import urlparse
            parsed = urlparse(url)
            if parsed.hostname not in self.ALLOWED_HOSTS:
                return ToolResult(
                    success=False,
                    error=f"域名不在允许列表中: {parsed.hostname}。允许的域名: {', '.join(self.ALLOWED_HOSTS)}"
                )

            req_headers = {"Content-Type": "application/json"}
            if headers:
                req_headers.update(headers)

            # 策略：内部服务直连；外部服务先走代理再直连
            attempts = []
            strategies = []
            if is_internal:
                strategies.append(("direct", False))
            else:
                if self._proxy_url:
                    strategies.append(("proxy", True))
                strategies.append(("direct", False))

            resp = None
            for label, use_proxy in strategies:
                try:
                    resp = await self._do_request(url, method, body, req_headers, use_proxy)
                    break  # 成功则跳出
                except Exception as e:
                    attempts.append(f"{label}: {type(e).__name__}: {e}")

            if resp is None:
                diag = f"所有连接方式均失败 (proxy={self._proxy_url or 'none'}):\n"
                diag += "\n".join(f"  - {a}" for a in attempts)
                return ToolResult(success=False, error=diag)

            # 处理响应
            status = resp.status_code
            resp_text = resp.text

            if status >= 400:
                return ToolResult(
                    success=False,
                    error=f"HTTP {status}\n{resp_text[:2000]}"
                )

            # 尝试格式化 JSON
            try:
                resp_json = resp.json()
                result_text = json.dumps(resp_json, ensure_ascii=False, indent=2)
            except (json.JSONDecodeError, ValueError):
                result_text = resp_text

            if len(result_text) > 8000:
                result_text = result_text[:8000] + "\n... (响应已截断)"

            return ToolResult(
                success=True,
                result=f"HTTP {status}\n{result_text}"
            )

        except Exception as e:
            return ToolResult(success=False, error=f"{type(e).__name__}: {e}")
