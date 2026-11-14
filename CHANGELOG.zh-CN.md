---
changelogVersion: 1
plugin: demomagic_beeuni
version: 0.2.0
locale: zh-CN
---
# Changelog

## [0.2.0]

### Added

- 支持用 `previous_task_id` 接着已成功的任务继续对话，通过 New API 校验任务归属，并调用 Beeuni 已有的消息提交接口。
- 按消息 ID 查询续聊结果；响应无法确认本轮消息时拒绝返回，需配套 Beeuni API 支持。
- 项目、会话和消息标识仅保存在网关服务端，保留对 0.1.0 任务的查询兼容。

### Migration

- 社区插件标识为 `demomagic_beeuni`。替换标识为 `beeuni` 的开发版时，请先等待旧任务结束，停用旧插件，再将渠道绑定到新插件。使用 `tasks` 字段配置 `demomagic_beeuni::beeuni-agent` 的价格。
