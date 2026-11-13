---
locale: zh-CN
---
# Beeuni

[English](README.md) | [简体中文](README.zh-CN.md)

通过 New API 调用 Beeuni Agent。安装插件，填写 Beeuni API Key 和项目 ID，即可向网关提交提示词。每次提交新建一个 Beeuni 会话，不需要另行部署适配服务。

## 使用条件

New API 需支持[任务插件 API v1](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md)及插件渠道配置。

Beeuni 线上 API 已提供 `GET /v1/projects/{project_id}/sessions/{session_id}/result`。如果使用其他 Beeuni API 环境，该环境也必须提供这个接口，无需额外部署结果服务。

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

## 模型与接口

`beeuni-agent` 是网关中的任务名称，不是底层大模型。Beeuni Agent、实际模型和 sandbox 由渠道配置决定。

| 网关接口 | 用途 |
| --- | --- |
| `POST /beeuni/v1/tasks` | 提交 `{ "model": "beeuni-agent", "prompt": "..." }`，返回 HTTP 202 |
| `GET /beeuni/v1/tasks/{task_id}` | 查询任务状态，完成后读取文本回答 |

轮询直到 `status` 为 `SUCCESS` 或 `FAILURE`。等待中的状态为 `SUBMITTED` 或 `IN_PROGRESS`。查询时始终使用 New API 返回的公开任务 ID。

插件直接调用 Beeuni 已有的会话创建接口和结果接口，将 Beeuni 的 `pending`、`running`、`completed`、`failed` 转为 New API 任务状态。成功结果中的 `output` 是 `{ "type": "text", "text": "..." }` 数组。使用结果前请检查 `truncated`。

## 计费

价格字段 `tasks` 按成功任务数计量。New API 在提交前预扣一个任务单位，成功后按一个单位结算；失败时按 New API 的退款机制处理。

在 New API 中设置 `beeuni::beeuni-agent` 的价格。例如，`u('tasks') * 0.01` 表示网关对每个成功任务收取 0.01 美元。这只是定价示例，不是 Beeuni 的价格。

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

## 限制与隔离

- 本版本只适合可信调用者。独立会话不等于项目文件、密钥或 Computer 访问权限隔离。不要在共享项目中存放客户隐私文件或敏感凭据。`accept_shared_project` 只是确认已知限制，不提供租户隔离。
- Beeuni 校验项目与会话权限。New API 在服务端保存上游会话标识，并负责校验公开任务 ID 的用户归属。渠道密钥应始终留在网关中。
- 提交请求只接受 `model` 和 `prompt`，提示词最多 32,768 个字符。调用者不能指定已有会话、其他项目、凭据或上游地址。
- 结果接口只返回用户可见的最终助手文本，不返回原始工具参数、工具结果、思考块或隐藏消息。保存的文本预览和输出长度限制可能造成截断。任务完成但没有支持的文本回答时，返回 `text_result_unavailable`。
- 结果查询读取持久化状态和日志，不会唤醒 sandbox。需要审批的任务可能一直等待，直到在 Beeuni 中处理。
- 结果对应所提交会话中最近结束的一轮，不是整个项目的汇总，也不代表所有后台 Agent 已结束。网关轮询期间，不要向任务会话发送无关消息。
- 0.1.0 不提供 Chat Completions 或 Responses 兼容、流式输出、继续会话、取消任务、文件下载或总成本计量。

## 开发与分发

Node.js 22 或更新版本仅用于运行本仓库的开发命令，安装插件的管理员不需要运行 Node.js 服务。

执行 `npm test` 运行本地测试；`npm run check` 执行语法检查和测试，两者均不需要 Beeuni 凭据。`npm run pack:plugin` 生成插件分发包。

单文件插件、双语使用说明和当前版本更新日志遵循[社区插件格式](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md#usage-guide-readme)。上传插件不等于上架市场；上架需要另行提交并审核。
