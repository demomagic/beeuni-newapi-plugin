---
changelogVersion: 1
plugin: demomagic_beeuni
version: 0.2.0
locale: en
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [0.2.0]

### Added

- Continue a successful task with `previous_task_id`, using New API's origin-task ownership checks and Beeuni's existing prompt endpoint.
- Read continuation results by prompt ID, rejecting responses that cannot identify the requested prompt. Requires corresponding Beeuni API support.
- Keep project, session, and prompt references private; retain polling compatibility for 0.1.0 tasks.

### Migration

- The community plugin key is `demomagic_beeuni`. If replacing the development plugin keyed `beeuni`, finish its pending tasks, disable it, and bind the channel to the new plugin. Configure pricing for `demomagic_beeuni::beeuni-agent` using the `tasks` field.
