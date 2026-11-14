---
locale: zh-CN
---
# Beeuni

[English](README.md) | [简体中文](README.zh-CN.md)

[Beeuni](https://beeuni.ai) 提供 Agent 即服务和 Computer 即服务。你可以通过 API 运行 AI Agent，也可以将自己的 Agent 接入配备桌面、浏览器、终端和持久化文件存储的 AI Computer。

通过 New API 调用 Beeuni Agent。安装插件，填写 Beeuni API Key 和项目 ID，即可提交任务，也可以接着已完成的任务继续对话。不需要另行部署适配服务。

本插件提供 Agent 任务提交和文本结果查询。直接操作桌面、终端和文件需使用 Beeuni API 或 SDK，不通过下方插件接口。

## 使用条件

New API 需支持[任务插件 API v1](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md)及插件渠道配置。

Beeuni API 需提供 `GET /v1/projects/{project_id}/sessions/{session_id}/result`。0.2.0 的续聊还需要该接口支持 `?prompt_id=…`，并在响应中返回相同的 `prompt_id`。启用续聊前，请确认所连接的 Beeuni API 已支持该能力；仅上传插件不会自动开启后端能力。无需额外部署结果服务。

## 渠道设置

1. 准备专用 Beeuni 项目和 Agent，仅供可信的网关调用者使用。创建 Beeuni API Key（`beeuni_pat_…`），范围选该项目。`Entire workspace`（整个工作区）的 Key 在所属用户有项目访问权限时也可使用，但授权范围更大。凭据需要 `project.session.start`、`project.session.read` 和所选 Agent 的访问权限。
2. 在 New API 的任务插件管理页面上传 `plugin.js`。
3. 新建渠道，类型选择 **任务插件（61）**，绑定 **Beeuni**。
4. Base URL 留空，默认使用 `https://api.beeuni.ai`；也接受末尾带 `/v1` 的地址。只有连接其他已提供结果接口的 Beeuni API 环境时才需更改，不需要填写另一个中转服务。
5. 渠道密钥填 Beeuni API Key，插件将其作为 Bearer 凭据发送。
6. 填写下方渠道配置，启用 `beeuni-agent`，并在开放调用前设置价格。

| 配置项 | 用途 |
| --- | --- |
| `project_id` | 必填，Beeuni 项目 ID |
| `agent_name` | 可选，指定 Agent；不填则使用项目默认值 |
| `model` | 可选，指定实际模型，不是网关中的任务名称 |
| `sandbox_slug` | 可选，指定 sandbox |
| `accept_shared_project` | 默认 `false`；阅读并接受下方隔离限制后，才设为 `true` |

这些配置由管理员设置，调用者不能在请求中覆盖。调用者使用自己的 New API Token，不需要获得渠道中的 Beeuni Key。

接受下方隔离限制后，才能将 `accept_shared_project` 设为 `true`；为 `false` 或未填写时无法提交任务。项目必须提前创建，插件只创建会话，不创建项目。可从项目网址（`/projects/{project_id}`）获取 `project_id`。不要把 Beeuni Key 放进客户端请求或公开的问题反馈中。

最小渠道配置如下，请替换示例项目 ID：

```json
{
  "project_id": "11111111-1111-4111-8111-111111111111",
  "accept_shared_project": true
}
```

## 模型与接口

`beeuni-agent` 是网关中的任务名称，不是底层大模型。Beeuni Agent、实际模型和 sandbox 由渠道配置决定。

| 网关接口 | 用途 |
| --- | --- |
| `POST /beeuni/v1/tasks` | 提交 `{ "model": "beeuni-agent", "prompt": "..." }`，返回 HTTP 202 |
| `GET /beeuni/v1/tasks/{task_id}` | 查询任务状态，完成后读取文本回答 |

轮询直到 `status` 为 `SUCCESS` 或 `FAILURE`。等待中的状态为 `SUBMITTED` 或 `IN_PROGRESS`。查询时始终使用 New API 返回的公开任务 ID。

响应带有 `Retry-After` 时，按该间隔查询（提交响应建议三秒）；长任务可逐渐延长间隔。查询超时后，继续查同一个 ID，不要重新提交任务。重复 POST 可能创建另一条任务并产生额外费用；插件内部的重试保护不会合并调用者多次提交的请求。如果提交响应丢失，请先检查网关任务记录，再决定是否重新提交。

插件直接调用 Beeuni 已有的会话创建、消息提交和结果接口，将 Beeuni 的 `pending`、`running`、`completed`、`failed` 转为 New API 任务状态。成功结果中的 `output` 是 `{ "type": "text", "text": "..." }` 数组。使用结果前请检查 `truncated`。

## 计费

价格字段 `tasks` 按成功任务数计量。New API 在提交前预扣一个任务单位，成功后按一个单位结算；失败时按 New API 的退款机制处理。

在 New API 中设置 `demomagic_beeuni::beeuni-agent` 的价格。例如，`u('tasks') * 0.01` 表示网关对每个成功任务收取 0.01 美元。这只是定价示例，不是 Beeuni 的价格。

Beeuni 另行按实际使用量向管理员账号计费。任务失败、网关超时或客户端断开时，仍可能产生模型和 Computer 消耗。New API 退款不等于退还上游费用。插件不计算平台总成本、不限制 Beeuni 消费上限，也不会在网关超时时取消 Beeuni 任务。

## 示例

使用 New API Token 提交任务：

```bash
curl https://gateway.example.com/beeuni/v1/tasks \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"beeuni-agent","prompt":"写一个 Python 函数，返回列表的中位数，并说明边界情况。"}'
```

用响应中的 `id` 查询任务：

```bash
curl "https://gateway.example.com/beeuni/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $NEW_API_TOKEN"
```

如果提示词要求 Agent 回复 `BEEUNI_PLUGIN_OK`，成功响应如下。`id` 是 New API 的公开任务 ID，不是 Beeuni 的上游会话 ID。

```json
{
  "id": "public-task-id",
  "model": "beeuni-agent",
  "status": "SUCCESS",
  "output": [{ "type": "text", "text": "BEEUNI_PLUGIN_OK" }],
  "truncated": false,
  "error": null
}
```

## 继续对话

上一条任务达到 `SUCCESS` 后，用它的 New API 公开任务 ID 提交下一条消息：

```bash
curl https://gateway.example.com/beeuni/v1/tasks \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"beeuni-agent","prompt":"为这些边界情况补充测试。","previous_task_id":"public-task-id"}'
```

响应会返回新的公开任务 ID，继续用它查询结果。Beeuni 沿用原会话的 Agent、模型、sandbox 和上下文，插件不会另建会话或 Computer。每条成功的后续任务仍按一个任务单位计费。

New API 会解析上一条任务，并校验它属于同一网关用户。不要传 Beeuni 会话 ID。渠道的项目不能更换；同一渠道配置的所有 Key 都应能访问同一个 Beeuni 项目。请按顺序续聊：等待成功，再用最新任务 ID 继续。不要向同一会话并发提交多条后续任务，也不要在任务等待期间从其他入口发送消息。

续聊结果按本轮提交的消息查询，不会直接取最新一条回答。如果后端尚不支持按消息查询，插件会拒绝该结果，避免误返回上一轮回答；但消息可能已经运行，并产生 Beeuni 费用。

## 限制与隔离

- 本版本只适合可信调用者。独立会话不等于项目文件、密钥或 Computer 访问权限隔离。不要在共享项目中存放客户隐私文件或敏感凭据。`accept_shared_project` 只是确认已知限制，不提供租户隔离。
- Beeuni 校验项目与会话权限。New API 在服务端保存上游会话标识，并负责校验公开任务 ID 的用户归属。渠道密钥应始终留在网关中。
- 提交请求只接受 `model`、`prompt` 和可选的 `previous_task_id`，提示词最多 32,768 个字符。调用者不能传任意 Beeuni 会话 ID、其他项目、凭据或上游地址。
- 结果接口只返回用户可见的最终助手文本，不返回原始工具参数、工具结果、思考块或隐藏消息。保存的文本预览和输出长度限制可能造成截断。任务完成但没有支持的文本回答时，返回 `text_result_unavailable`。
- 结果查询读取持久化状态和日志，不会唤醒 sandbox。需要审批的任务可能一直等待，直到在 Beeuni 中处理。
- 新建会话的任务读取该会话最近结束的一轮；续聊任务读取本轮消息对应的结果。两者都不是整个项目的汇总，也不代表所有后台 Agent 已结束。
- 0.2.0 不提供 Chat Completions 或 Responses 兼容、流式输出、取消任务、文件下载或总成本计量。

## 开发与分发

Node.js 22 或更新版本仅用于运行本仓库的开发命令，安装插件的管理员不需要运行 Node.js 服务。

执行 `npm test` 运行本地测试；`npm run check` 执行语法检查和测试，两者均不需要 Beeuni 凭据。`npm run pack:plugin` 生成插件分发包。

单文件插件、双语使用说明和当前版本更新日志遵循[社区插件格式](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md#usage-guide-readme)。上传插件不等于上架市场；上架需要另行提交并审核。

社区插件标识为 `demomagic_beeuni`，显示名称为 Beeuni。本次版本标签为 `v0.2.0`。如果手动安装过标识为 `beeuni` 的早期开发版，请先停用旧插件，再安装新版、重新绑定渠道并设置价格。旧任务仍属于旧插件，请等它们结束后再切换。
