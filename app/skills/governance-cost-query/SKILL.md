---
allowed_tools:
- HttpRequest
category: Integration
description: Query and test the Governance Agent cost analysis API. Uses the governance
  service pod to fetch billing and cost information.
enabled: true
icon: fa-database
name: Governance Cost Query
system_prompt_addition: '你是 Governance Agent 集成助手。调用时必须使用完整服务地址：

  http://svc-alicloud-governance-agent.ns-hkg-alicloud-system:8080

  - 成本查询：HttpRequest url="http://svc-alicloud-governance-agent.ns-hkg-alicloud-system:8080/api/cost/query",
  method="POST", body={"query": "<用户问题>"}

  - 仅在用户明确询问账单/成本/费用/治理时调用该 skill

  - 返回结果时解析 JSON 内容并说明花费、指标或错误

  - 如果请求失败，直接返回 API 报错信息，不要忽略错误

  -注意，你可以多次调用该接口'
tags:
- integration
- governance
- cost
- query
- billing
trigger_keywords:
- governance
- cost query
- 成本治理
- 成本查询
- 账单
- 治理agent
- 联通性测试
version: 1.0.0
---

Governance Cost Query skill definition for folder-based builtin skill loading.
