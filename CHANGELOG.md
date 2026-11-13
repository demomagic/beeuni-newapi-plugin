---
changelogVersion: 1
plugin: beeuni
version: 0.1.0
locale: en
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [0.1.0]

### Added

- Submit Beeuni Agent tasks through `POST /beeuni/v1/tasks` and poll their status and text results through `GET /beeuni/v1/tasks/{task_id}`.
- Connect directly to the Beeuni API with a channel key and project ID; select the Agent, model, and sandbox in channel settings.
- Return visible assistant text without forwarding raw reasoning or tool logs, and mark incomplete results with `truncated`.
- Price `beeuni-agent` by successful task count using the `tasks` field.
