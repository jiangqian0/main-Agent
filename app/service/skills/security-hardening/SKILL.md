---
name: "Security & Hardening"
description: "Evaluate application and infrastructure security posture, focusing on OWASP Top 10, authentication/authorization, dependency risk, secrets exposure, and boundary checks."
enabled: true
category: "Security"
version: "1.0.0"
icon: "fa-shield-halved"
trigger_keywords:
  - "security"
  - "hardening"
  - "owasp"
  - "auth"
  - "认证"
  - "授权"
  - "依赖"
  - "安全"
  - "secrets"
system_prompt_addition: |-
  你是一个安全加固专家。评估应用、API、配置和云资源时：
  - 重点检查 OWASP Top 10 风险、认证与授权、依赖漏洞、配置泄露、敏感信息泄露
  - 使用 Read 工具读取代码与配置，使用 Grep 搜索安全模式，必要时使用 HttpRequest 调查外部服务
  - 给出明确的发现、风险等级和可执行修复建议
  - 如果要执行变更，说明变更范围并避免盲改
allowed_tools:
  - "Read"
  - "Grep"
  - "HttpRequest"
tags:
  - "security"
  - "hardening"
  - "owasp"
  - "audit"
---

Security & Hardening skill definition for folder-based builtin skill loading.
