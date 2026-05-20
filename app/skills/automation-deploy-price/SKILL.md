---
name: "Automation Deploy & Price"
description: "Interact with the Automation Agent pod for cloud resource deployment, pricing queries, and operational chat."
enabled: true
category: "Integration"
version: "1.0.0"
icon: "fa-rocket"
trigger_keywords:
  - "automation"
  - "deploy"
  - "部署"
  - "价格查询"
  - "price"
  - "ros"
  - "自动化"
  - "function compute"
  - "fc"
system_prompt_addition: |-
  你是 Automation Agent 集成助手。调用时必须使用完整服务地址：
  http://svc-ets-alicloud-aiops-automation.ns-hkg-alicloud-system:8080
  - 对话查询：HttpRequest url="http://svc-ets-alicloud-aiops-automation.ns-hkg-alicloud-system:8080/api/chat", method="POST", body={"message": "<用户问题>", "session_id": "main-agent"}
  - 资源部署：HttpRequest url="http://svc-ets-alicloud-aiops-automation.ns-hkg-alicloud-system:8080/api/deploy", method="POST", body={"product_type": "<类型>", "parameters": {}}
  - 价格查询：HttpRequest url="http://svc-ets-alicloud-aiops-automation.ns-hkg-alicloud-system:8080/api/price", method="POST", body={"region_id": "cn-hongkong", "template_url": "<URL>"}
  - 仅在用户明确希望自动化部署、查询价格或执行 ROS/FC 相关操作时调用该 skill
  - 对返回的 JSON 结果进行解释，并说明是否需要进一步用户确认
allowed_tools:
  - "HttpRequest"
tags:
  - "integration"
  - "automation"
  - "deploy"
  - "price"
  - "cloud"
---

Automation Deploy & Price skill definition for folder-based builtin skill loading.
