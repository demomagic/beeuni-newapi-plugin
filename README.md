---
locale: en
translations:
  zh-CN: README.zh-CN.md
---
# Beeuni

Run Beeuni Agent tasks through New API. Install the plugin, provide a Beeuni API key and project ID, then submit prompts to your gateway. Each submission creates a new Beeuni session. No separate adapter service is required.

## Requirements

Use a New API version that supports [task plugin API v1](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md) and plugin channel configuration.

The hosted Beeuni API provides `GET /v1/projects/{project_id}/sessions/{session_id}/result`. An alternate Beeuni API environment must also provide this endpoint. No additional result service is needed.

## Channel setup

1. Prepare a dedicated Beeuni project and Agent for trusted gateway callers. Create a Beeuni API key (`beeuni_pat_…`) scoped to that project. An `Entire workspace` key also works if its owner can access the project, but grants broader access. The credential needs `project.session.start`, `project.session.read`, and access to the selected Agent.
2. Upload `plugin.js` in New API's task-plugin administration page.
3. Create a **Task Plugin (61)** channel and select **Beeuni**.
4. Leave Base URL empty to use `https://api.beeuni.ai`. An address ending in `/v1` is also accepted. Change it only to another Beeuni API environment that provides the result endpoint, not to a separate relay service.
5. Enter the Beeuni API key as the channel key. The plugin sends it as a Bearer credential.
6. Fill the channel configuration below, enable `beeuni-agent`, and configure its price before admitting callers.

| Setting | Meaning |
| --- | --- |
| `project_id` | Required Beeuni project ID |
| `agent_name` | Optional Agent name; omit to use the project default |
| `model` | Optional underlying model; this is not the gateway task name |
| `sandbox_slug` | Optional sandbox selection |
| `accept_shared_project` | Defaults to `false`; set to `true` only after reading the isolation limits below |

These are administrator settings. A caller cannot override them in a task request. Callers use their New API tokens, not the channel's Beeuni key.

Set `accept_shared_project` to `true` only after accepting the isolation limits below. Submission is blocked while it is `false` or omitted. The project must already exist; the plugin creates sessions, not projects. Obtain `project_id` from the project's URL (`/projects/{project_id}`). Never paste the Beeuni key into a client request or a public issue.

## Models and endpoints

`beeuni-agent` is the gateway task name, not a foundation model. The channel settings select the Beeuni Agent, underlying model, and sandbox.

| Gateway endpoint | Purpose |
| --- | --- |
| `POST /beeuni/v1/tasks` | Submit `{ "model": "beeuni-agent", "prompt": "..." }`; returns HTTP 202 |
| `GET /beeuni/v1/tasks/{task_id}` | Read task status and the completed text answer |

Poll until `status` is `SUCCESS` or `FAILURE`. Pending states are `SUBMITTED` and `IN_PROGRESS`. Always use the public task ID returned by New API.

The plugin calls Beeuni's existing session-creation endpoint and its result endpoint directly. Beeuni's `pending`, `running`, `completed`, and `failed` states map to New API's task states. Successful replies contain `output`, an array of `{ "type": "text", "text": "..." }` entries. Check `truncated` before treating a result as complete.

## Billing

The `tasks` price field counts successful tasks. New API reserves one task unit before submission and settles one unit on success. A failed task follows New API's refund handling.

Configure the price for `beeuni::beeuni-agent`. For example, `u('tasks') * 0.01` charges USD 0.01 per successful task at the gateway. This is a pricing example, not a Beeuni price.

Beeuni bills the administrator's account separately for actual use. Failed tasks, gateway timeouts, and disconnected clients may still consume Beeuni model or Computer resources. A New API refund does not reverse those charges. The plugin does not meter total platform costs, enforce a Beeuni spending cap, or cancel a Beeuni task when the gateway times out.

## Example

Submit with your New API token:

```bash
curl https://gateway.example.com/beeuni/v1/tasks \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"beeuni-agent","prompt":"Write a Python function that returns the median of a list. Explain its edge cases."}'
```

Read the task using the returned `id`:

```bash
curl "https://gateway.example.com/beeuni/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $NEW_API_TOKEN"
```

For a prompt asking the Agent to reply with `BEEUNI_PLUGIN_OK`, a successful response has this shape. `id` is the public New API task ID, not the upstream Beeuni session ID.

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

## Limits and isolation

- Use this version for trusted callers only. Separate sessions do not isolate project files, secrets, or Computer access. Do not place private customer files or sensitive credentials in the shared project. `accept_shared_project` acknowledges this limit; it does not provide tenant isolation.
- Beeuni enforces project and session permissions. New API stores the upstream session identity privately and checks ownership of its public task IDs. Keep the channel key on the gateway.
- Submission accepts only `model` and `prompt`. Prompts are limited to 32,768 characters. Callers cannot select an existing session, another project, credentials, or an upstream URL.
- The result API returns visible final assistant text, not raw tool parameters, tool outputs, reasoning blocks, or hidden messages. Saved text previews and output limits may truncate a result. A completed task without a supported text answer reports `text_result_unavailable`.
- Result reads use persisted state and logs without waking the sandbox. A task waiting for approval may remain pending until handled in Beeuni.
- A result belongs to the submitted session's most recently ended turn. It is not a project-wide summary or proof that every background Agent has finished. Do not send unrelated messages to the task session while the gateway is polling it.
- Version 0.1.0 does not provide Chat Completions or Responses compatibility, streaming, continuation, cancellation, file downloads, or total-cost metering.

## Development and distribution

Node.js 22 or later is needed only to run this repository's development commands. Administrators do not need a Node.js service for the plugin.

Run `npm test` for local tests and `npm run check` for syntax checks and tests. Neither command requires Beeuni credentials. `npm run pack:plugin` creates the plugin distribution archive.

The single-file plugin, bilingual usage guides, and version-specific release notes follow the [community plugin format](https://github.com/QuantumNous/new-api-plugins/blob/main/docs/plugin-api/v1.md#usage-guide-readme). Uploading a plugin does not list it in the marketplace; publication requires a separate submission and review.
