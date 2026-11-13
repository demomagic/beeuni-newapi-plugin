---
changelogVersion: 1
plugin: beeuni
version: 0.2.0
locale: zh-CN
---
# Changelog

## [0.2.0]

### Added

- 支持用 `previous_task_id` 接着已成功的任务继续对话，通过 New API 校验任务归属，并调用 Beeuni 已有的消息提交接口。
- 按消息 ID 查询续聊结果；响应无法确认本轮消息时拒绝返回，需配套 Beeuni API 支持。
- 项目、会话和消息标识仅保存在网关服务端，保留对 0.1.0 任务的查询兼容。
