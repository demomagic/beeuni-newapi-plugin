// New API task plugin API v1. The gateway calls Beeuni's existing session API.
const MODEL = "beeuni-agent";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROMPT_LENGTH = 32768;
const MAX_OUTPUT_LENGTH = 131072;
const STATUS_MAP = { pending: "SUBMITTED", running: "IN_PROGRESS", completed: "SUCCESS", failed: "FAILURE" };

export const meta = {
  apiVersion: 1, key: "beeuni", name: "Beeuni", version: "0.1.0", icon: "text:BE",
  author: { name: "BeeuniLab", url: "https://github.com/BeeuniLab" },
  website: "https://beeuni.ai",
  description: { en: "Run Beeuni Agent tasks and retrieve their text results", zh: "运行 Beeuni Agent 任务并获取文本结果" },
  baseUrl: "https://api.beeuni.ai", auth: "api_key",
  keyHint: { en: "Beeuni API key", zh: "Beeuni API Key" },
  models: [MODEL], fetchMode: "per_task",
  channelConfig: {
    type: "object",
    properties: {
      project_id: {
        type: "string", title: { en: "Project ID", zh: "项目 ID" },
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
      },
      agent_name: { type: "string", title: { en: "Agent name", zh: "Agent 名称" }, maxLength: 128 },
      model: { type: "string", title: { en: "Underlying model", zh: "底层模型" }, maxLength: 256 },
      sandbox_slug: { type: "string", title: { en: "Sandbox", zh: "Sandbox" }, maxLength: 128 },
      accept_shared_project: {
        type: "boolean", default: false,
        title: { en: "Allow trusted callers to share this project", zh: "允许可信调用者共享此项目" },
        description: { en: "Sessions can share project files and resources", zh: "会话可能共享项目文件和资源" },
      },
    },
    required: ["project_id"],
  },
  routes: [
    { method: "POST", path: "/beeuni/v1/tasks", type: "submit", decode: "createTask", render: "taskCreated" },
    { method: "GET", path: "/beeuni/v1/tasks/:task_id", type: "query", render: "taskStatus" },
  ],
  usageSchema: { tasks: { type: "number", unit: "count", description: { en: "Successful task unit price", zh: "成功任务单价" } } },
  usageExamples: [{ label: "Agent task", facts: { tasks: 1 } }],
};

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("A valid Beeuni project or session ID is required");
  return value.toLowerCase();
}

function promptBody(value) {
  if (!object(value)) throw new Error("A JSON object is required");
  for (const key of Object.keys(value)) {
    if (key !== "model" && key !== "prompt") throw new Error("Unsupported request field");
  }
  if (typeof value.model !== "string" || !value.model.trim()) throw new Error("model is required");
  if (typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > MAX_PROMPT_LENGTH)
    throw new Error("prompt must contain 1 to 32768 characters");
  return { model: value.model, prompt: value.prompt };
}

function channel(ctx) {
  if ((ctx.upstreamModel || ctx.model) !== MODEL) throw new Error("Unsupported Beeuni model");
  if (!object(ctx.config)) throw new Error("Configure the Beeuni project on the channel");
  const projectId = uuid(ctx.config.project_id);
  if (ctx.config.accept_shared_project !== true) throw new Error("Confirm that only trusted callers share this project");
  return projectId;
}

function address(ctx) {
  let base = typeof ctx.baseUrl === "string" && ctx.baseUrl ? ctx.baseUrl.replace(/\/+$/, "") : meta.baseUrl;
  // Not every plugin runtime provides URL. The host also validates addresses.
  if (!/^https?:\/\/[^\s/@?#\\]+(?:\/[^\s?#\\]*)?$/.test(base)) throw new Error("Invalid Beeuni API address");
  if (ctx.upstream && ctx.upstream.kind !== "vendor") throw new Error("Gateway chaining is not supported");
  if (base.endsWith("/v1")) base = base.slice(0, -3);
  return base + "/v1";
}

function headers(ctx) {
  if (typeof ctx.apiKey !== "string" || !ctx.apiKey || /[\r\n]/.test(ctx.apiKey)) throw new Error("A Beeuni API key is required");
  return { Authorization: "Bearer " + ctx.apiKey, Accept: "application/json" };
}

function failure(data) {
  return data && data.error && data.error.code === "text_result_unavailable"
    ? { code: "text_result_unavailable", message: "The task completed without a supported text result" }
    : { code: "task_failed", message: "Beeuni task failed; contact the gateway administrator" };
}

export function buildSubmitRequest(ctx) {
  const projectId = channel(ctx);
  const body = promptBody(ctx.requestBody);
  if (typeof ctx.publicTaskId !== "string" || !/^[A-Za-z0-9._:+/=-]{1,200}$/.test(ctx.publicTaskId)) throw new Error("A stable gateway task ID is required");
  const input = { initial_prompt: body.prompt, space_id: null };
  for (const name of ["agent_name", "model", "sandbox_slug"]) {
    const value = ctx.config[name];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || !value.trim() || value.length > (name === "model" ? 256 : 128)) throw new Error("Invalid Beeuni channel configuration");
    input[name] = value.trim();
  }
  return {
    url: address(ctx) + "/projects/" + projectId + "/sessions", method: "POST",
    headers: Object.assign(headers(ctx), { "Content-Type": "application/json", "Idempotency-Key": "newapi:" + ctx.publicTaskId }),
    body: input,
  };
}

export function parseSubmitResponse(ctx, response) {
  if (response.statusCode !== 201 && response.statusCode !== 202) throw new Error("Beeuni did not accept the session");
  if (!object(response.body)) throw new Error("Invalid Beeuni session response");
  if (!response.body.session_id) throw new Error("Beeuni session creation is still pending; retry with the same idempotency key");
  return { taskId: uuid(response.body.session_id), taskData: { output: [], truncated: false }, state: { project_id: channel(ctx) } };
}

export function buildQueryRequest(ctx) {
  // Keep the original project if the administrator changes channel config.
  if (!object(ctx.state)) throw new Error("Missing Beeuni task state");
  return {
    url: address(ctx) + "/projects/" + uuid(ctx.state.project_id) + "/sessions/" + uuid(ctx.taskId) + "/result",
    method: "GET", headers: headers(ctx),
  };
}

export function parseTaskResult(ctx, body) {
  if (!object(body) || !Object.prototype.hasOwnProperty.call(STATUS_MAP, body.status)) return { status: "UNKNOWN" };
  if (body.session_id !== undefined && uuid(body.session_id) !== uuid(ctx.taskId)) throw new Error("Beeuni session ID does not match");
  if (!Array.isArray(body.output) || typeof body.truncated !== "boolean") throw new Error("Invalid Beeuni task result");
  let length = 0;
  for (const part of body.output) {
    if (!object(part) || part.type !== "text" || typeof part.text !== "string") throw new Error("Invalid Beeuni text result");
    length += part.text.length;
    if (length > MAX_OUTPUT_LENGTH) throw new Error("Beeuni result exceeds the supported text size");
  }
  const result = { status: STATUS_MAP[body.status] };
  if (result.status === "SUCCESS") result.progress = "100%";
  if (result.status === "FAILURE") result.reason = failure(body).message;
  return result;
}

export function extractUsage(ctx) {
  channel(ctx);
  promptBody(ctx.requestBody);
  return ctx.usagePurpose === "billing_ratios" ? null : { tasks: 1 };
}

export function extractUsageOnComplete(ctx, result) { return { tasks: result.status === "SUCCESS" ? 1 : 0 }; }

function renderTask(ctx, task) {
  if (!object(task)) throw new Error("Invalid gateway task");
  const data = object(task.data) ? task.data : {};
  return {
    id: task.task_id, model: ctx.model || MODEL, status: task.status,
    output: task.status === "SUCCESS" && Array.isArray(data.output)
      ? data.output.filter(function (part) { return object(part) && part.type === "text" && typeof part.text === "string"; })
        .map(function (part) { return { type: "text", text: part.text }; }) : [],
    truncated: data.truncated === true,
    error: task.status === "FAILURE" ? failure(data) : null,
  };
}

export const native = {
  createTask: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const body = promptBody(ctx.body.value);
    return { kind: "submit", model: body.model, action: "agent_task", requestBody: body };
  },
  taskCreated: function (ctx, task) { return { __status: 202, __headers: { "Retry-After": "3" }, __body: renderTask(ctx, task) }; },
  taskStatus: renderTask,
  error: function (ctx, error) {
    return { error: { code: error.code || "beeuni_gateway_error", message: "Beeuni request failed; check the request and contact the gateway administrator" } };
  },
};
