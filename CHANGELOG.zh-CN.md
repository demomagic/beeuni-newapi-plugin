---
changelogVersion: 1
plugin: beeuni
version: 0.1.0
locale: zh-CN
---
# Changelog

## [0.1.0]

### Added

- 通过 `POST /beeuni/v1/tasks` 提交 Beeuni Agent 任务，并通过 `GET /beeuni/v1/tasks/{task_id}` 查询状态和文本结果。
- 使用渠道密钥和项目 ID 直连 Beeuni API，并在渠道配置中选择 Agent、模型和 sandbox。
- 仅返回用户可见的助手文本，不转发原始思考块或工具日志，并用 `truncated` 标记不完整的结果。
- 使用 `tasks` 字段，按 `beeuni-agent` 的成功任务数定价。
