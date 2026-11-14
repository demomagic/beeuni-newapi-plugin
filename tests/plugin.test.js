import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as plugin from '../plugin.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '33333333-3333-4333-8333-333333333333';
const PROMPT = '44444444-4444-4444-8444-444444444444';
const OTHER_PROMPT = '55555555-5555-4555-8555-555555555555';
const sessionRef = `beeuni:${PROJECT}:${SESSION}`;
const promptRef = `${sessionRef}:${PROMPT}`;
const ctx = {
  baseUrl: 'https://api.beeuni.ai', apiKey: 'test-credential',
  model: 'beeuni-agent', upstreamModel: 'beeuni-agent',
  publicTaskId: 'task_gateway_1', requestBody: { model: 'beeuni-agent', prompt: 'Compute 2 + 2.' },
  config: { project_id: PROJECT, accept_shared_project: true },
};
const query = { ...ctx, taskId: SESSION, state: { project_id: PROJECT } };
const result = { session_id: SESSION, status: 'completed', output: [{ type: 'text', text: '4' }], truncated: false, error: null };
const create = (value) => plugin.native.createTask({ body: { kind: 'json', value } });
const continuation = {
  ...ctx, publicTaskId: 'task_gateway_2',
  requestBody: { model: 'beeuni-agent', prompt: 'Multiply the answer by 3.', previous_task_id: 'task_gateway_1' },
  originTasks: [{ taskId: 'task_gateway_1', upstreamTaskId: sessionRef, action: 'agent_task', status: 'SUCCESS' }],
};

test('declares a direct Beeuni task channel with administrator configuration', () => {
  assert.equal(plugin.meta.apiVersion, 1);
  assert.equal(plugin.meta.key, 'demomagic_beeuni');
  assert.deepEqual(plugin.meta.name, { en: 'Beeuni', zh: 'Beeuni 智能体' });
  assert.equal(plugin.meta.version, '0.2.0');
  assert.equal(plugin.meta.baseUrl, 'https://api.beeuni.ai');
  assert.equal(plugin.meta.fetchMode, 'per_task');
  assert.deepEqual(plugin.meta.models, ['beeuni-agent']);
  assert.equal(plugin.meta.allowedHosts, undefined);
  assert.equal(plugin.meta.protocols, undefined);
  assert.deepEqual(plugin.meta.routes.map((route) => route.type), ['submit', 'query']);
  assert.deepEqual(plugin.meta.routes.map((route) => route.path), ['/beeuni/v1/tasks', '/beeuni/v1/tasks/:task_id']);
  assert.ok(plugin.meta.channelConfig.required.includes('project_id'));
  for (const name of ['project_id', 'agent_name', 'model', 'sandbox_slug', 'accept_shared_project'])
    assert.ok(plugin.meta.channelConfig.properties[name]);
  assert.equal(plugin.meta.channelConfig.properties.accept_shared_project.default, false);
});

test('normalizes JSON input without mutating it', () => {
  const body = Object.freeze({ model: 'beeuni-agent', prompt: 'Hello' });
  assert.deepEqual(create(body), { kind: 'submit', model: 'beeuni-agent', action: 'agent_task', requestBody: body });
});

for (const value of [null, [], {}, { model: '', prompt: 'Hello' }, { model: 'beeuni-agent', prompt: '  ' }, { model: 'beeuni-agent', prompt: 'a'.repeat(32769) }])
  test('rejects malformed input ' + JSON.stringify(value).slice(0, 70), () => assert.throws(() => create(value)));

for (const field of ['session_id', 'project_id', 'agent_name', 'metadata', 'stream', 'files', 'callback_url', 'parent_session_id', '__proto__']) {
  test('rejects caller control over ' + field, () => {
    const body = JSON.parse('{"model":"beeuni-agent","prompt":"Hi","' + field + '":"forbidden"}');
    assert.throws(() => create(body), /Unsupported request field/);
  });
}

test('requires JSON, not multipart', () => assert.throws(() => plugin.native.createTask({ body: { kind: 'multipart' } }), /JSON/));

test('creates a Beeuni session directly with a stable idempotency key', () => {
  const request = plugin.buildSubmitRequest(ctx);
  assert.deepEqual(request, {
    url: `https://api.beeuni.ai/v1/projects/${PROJECT}/sessions`, method: 'POST',
    headers: { Authorization: 'Bearer test-credential', Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': 'newapi:task_gateway_1' },
    body: { initial_prompt: 'Compute 2 + 2.', space_id: null },
  });
  assert.deepEqual(plugin.buildSubmitRequest(ctx), request);
  for (const baseUrl of ['https://api.beeuni.ai/', 'https://api.beeuni.ai/v1', 'https://api.beeuni.ai/v1/'])
    assert.equal(plugin.buildSubmitRequest({ ...ctx, baseUrl }).url, request.url);
});

test('only administrator settings select the Agent, model and sandbox', () => {
  const config = { ...ctx.config, agent_name: 'writer', model: 'provider/model', sandbox_slug: 'default' };
  assert.deepEqual(plugin.buildSubmitRequest({ ...ctx, config }).body, {
    initial_prompt: ctx.requestBody.prompt, space_id: null, agent_name: 'writer', model: 'provider/model', sandbox_slug: 'default',
  });
});

test('requires a valid project and explicit shared-project acknowledgement', () => {
  for (const config of [undefined, {}, { project_id: PROJECT }, { ...ctx.config, project_id: 'bad' }, { ...ctx.config, project_id: '../other' }, { ...ctx.config, accept_shared_project: false }, { ...ctx.config, accept_shared_project: 'true' }])
    assert.throws(() => plugin.buildSubmitRequest({ ...ctx, config }));
});

test('channel aliases map to the declared upstream task model', () => {
  assert.doesNotThrow(() => plugin.buildSubmitRequest({ ...ctx, model: 'friendly-agent', requestBody: { ...ctx.requestBody, model: 'friendly-agent' } }));
  assert.throws(() => plugin.buildSubmitRequest({ ...ctx, upstreamModel: 'other' }), /Unsupported/);
});

test('uses the declared Beeuni API address when the channel address is empty', () => {
  for (const baseUrl of ['', undefined])
    assert.equal(plugin.buildSubmitRequest({ ...ctx, baseUrl }).url, plugin.buildSubmitRequest(ctx).url);
});

for (const baseUrl of ['ftp://example.com', 'https://key@example.com', 'https://example.com?key=value', 'https://example.com/#x', 'https://example.com\\evil', 'https://example.com\n'])
  test('rejects unsafe Beeuni URL ' + JSON.stringify(baseUrl), () => assert.throws(() => plugin.buildSubmitRequest({ ...ctx, baseUrl })));

test('requires credentials and a stable gateway task identity', () => {
  for (const apiKey of ['', null, 'key\r\nOther: value']) assert.throws(() => plugin.buildSubmitRequest({ ...ctx, apiKey }));
  for (const publicTaskId of ['', undefined, 'bad\nkey']) assert.throws(() => plugin.buildSubmitRequest({ ...ctx, publicTaskId }));
  assert.throws(() => plugin.buildSubmitRequest({ ...ctx, upstream: { kind: 'new_api' } }), /chaining/);
});

test('accepts created and queued sessions without exposing upstream session objects', () => {
  for (const statusCode of [201, 202]) {
    const value = plugin.parseSubmitResponse(ctx, { statusCode, body: { session_id: SESSION, internal: 'private-token' } });
    assert.equal(value.taskId, sessionRef);
    assert.deepEqual(value.taskData, { output: [], truncated: false });
    assert.deepEqual(value.state, { project_id: PROJECT });
    assert.ok(!JSON.stringify(value.taskData).includes(SESSION));
    assert.ok(!JSON.stringify(value).includes('private-token'));
  }
  for (const body of [{}, { session_id: '../other' }, { id: SESSION }])
    assert.throws(() => plugin.parseSubmitResponse(ctx, { statusCode: 201, body }));
  assert.throws(() => plugin.parseSubmitResponse(ctx, { statusCode: 202, body: { command_id: 'queued-only' } }));
  assert.throws(() => plugin.parseSubmitResponse(ctx, { statusCode: 401, body: { error: 'secret' } }));
});

test('continuation decoder asks the host to resolve only the public previous task', () => {
  assert.deepEqual(create(continuation.requestBody), {
    kind: 'submit', model: 'beeuni-agent', action: 'agent_continue',
    requestBody: continuation.requestBody, originTaskIds: ['task_gateway_1'],
  });
  for (const previous_task_id of ['', null, 12, '../other?', 'bad\nvalue', 'x'.repeat(129)])
    assert.throws(() => create({ ...continuation.requestBody, previous_task_id }));
});

test('continues the resolved session with a stable, bounded prompt identity', () => {
  const request = plugin.buildSubmitRequest(continuation);
  assert.deepEqual(request, {
    url: `https://api.beeuni.ai/v1/projects/${PROJECT}/sessions/${SESSION}/prompts`, method: 'POST',
    headers: { Authorization: 'Bearer test-credential', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: { client_message_id: 'newapi:task_gateway_2', placement: 'transcript', parts: [{ type: 'text', text: continuation.requestBody.prompt }] },
  });
  assert.deepEqual(plugin.buildSubmitRequest(continuation), request);
  const config = { ...ctx.config, agent_name: 'different', model: 'different', sandbox_slug: 'different' };
  assert.deepEqual(plugin.buildSubmitRequest({ ...continuation, config }), request);
  assert.equal(plugin.buildSubmitRequest({ ...continuation, publicTaskId: 'x'.repeat(121) }).body.client_message_id.length, 128);
  assert.throws(() => plugin.buildSubmitRequest({ ...continuation, publicTaskId: 'x'.repeat(122) }));
});

test('requires a host-resolved, successful Beeuni origin in the unchanged project', () => {
  for (const originTasks of [undefined, [], [continuation.originTasks[0], continuation.originTasks[0]],
    [{ ...continuation.originTasks[0], taskId: 'other' }]])
    assert.throws(() => plugin.buildSubmitRequest({ ...continuation, originTasks }), /resolve/);
  for (const status of ['SUBMITTED', 'IN_PROGRESS', 'FAILURE', 'UNKNOWN'])
    assert.throws(() => plugin.buildSubmitRequest({ ...continuation, originTasks: [{ ...continuation.originTasks[0], status }] }), /successful/);
  assert.throws(() => plugin.buildSubmitRequest({ ...continuation, originTasks: [{ ...continuation.originTasks[0], action: 'other' }] }), /successful/);
  assert.throws(() => plugin.buildSubmitRequest({ ...continuation, config: { ...ctx.config, project_id: OTHER_PROJECT } }), /project has changed/);
  assert.throws(() => plugin.buildSubmitRequest({ ...continuation, originTasks: [{ ...continuation.originTasks[0], upstreamTaskId: '../other' }] }));
  assert.throws(() => plugin.buildSubmitRequest({ ...ctx, originTasks: continuation.originTasks }), /Unexpected origin/);
  for (const upstreamTaskId of [SESSION, promptRef])
    assert.equal(plugin.buildSubmitRequest({ ...continuation, originTasks: [{ ...continuation.originTasks[0], action: 'agent_continue', upstreamTaskId }] }).url,
      `https://api.beeuni.ai/v1/projects/${PROJECT}/sessions/${SESSION}/prompts`);
});

test('accepted and deduplicated prompts retain distinct private task references', () => {
  for (const statusCode of [200, 202]) {
    const accepted = plugin.parseSubmitResponse(continuation, { statusCode, body: { prompt_id: PROMPT, deduped: statusCode === 200, state: 'queued', message_id: 'not-the-final-wire-id', private: 'discard' } });
    assert.deepEqual(accepted, { taskId: promptRef, taskData: { output: [], truncated: false }, state: { project_id: PROJECT, prompt_id: PROMPT } });
    assert.ok(!JSON.stringify(accepted).includes('discard'));
    assert.notEqual(plugin.parseSubmitResponse(continuation, { statusCode, body: { prompt_id: OTHER_PROMPT } }).taskId, accepted.taskId);
  }
  for (const response of [
    { statusCode: 201, body: { prompt_id: PROMPT } }, { statusCode: 401, body: { prompt_id: PROMPT } },
    { statusCode: 202, body: null }, { statusCode: 202, body: {} },
    { statusCode: 202, body: { prompt_id: PROMPT, state: 'failed' } },
  ]) assert.throws(() => plugin.parseSubmitResponse(continuation, response));
});

test('queries and accepts only the requested prompt result', () => {
  const promptQuery = { ...query, taskId: promptRef, state: { project_id: PROJECT, prompt_id: PROMPT } };
  assert.equal(plugin.buildQueryRequest(promptQuery).url,
    `https://api.beeuni.ai/v1/projects/${PROJECT}/sessions/${SESSION}/result?prompt_id=${PROMPT}`);
  for (const [status, expected] of [['pending', 'SUBMITTED'], ['running', 'IN_PROGRESS'], ['completed', 'SUCCESS'], ['failed', 'FAILURE']])
    assert.equal(plugin.parseTaskResult(promptQuery, { ...result, prompt_id: PROMPT, status }).status, expected);
  for (const prompt_id of [undefined, OTHER_PROMPT, '../other'])
    assert.throws(() => plugin.parseTaskResult(promptQuery, { ...result, prompt_id }), /prompt-scoped/);
  assert.throws(() => plugin.buildQueryRequest({ ...promptQuery, state: { project_id: OTHER_PROJECT } }), /project does not match/);
});

test('private references and prompt IDs never leak through public presenters', () => {
  const rendered = plugin.native.taskStatus({}, { task_id: 'task_gateway_2', status: 'SUCCESS',
    data: { ...result, prompt_id: PROMPT, upstream_task_id: promptRef } });
  assert.equal(rendered.id, 'task_gateway_2');
  assert.ok(!JSON.stringify(rendered).includes(SESSION));
  assert.ok(!JSON.stringify(rendered).includes(PROMPT));
});

test('queries only the safe result route and pins the original project', () => {
  const request = plugin.buildQueryRequest({ ...query, config: { ...ctx.config, project_id: OTHER_PROJECT } });
  assert.equal(request.method, 'GET');
  assert.equal(request.url, `https://api.beeuni.ai/v1/projects/${PROJECT}/sessions/${SESSION}/result`);
  assert.deepEqual(request.headers, { Authorization: 'Bearer test-credential', Accept: 'application/json' });
  assert.ok(!request.url.includes('/log'));
  for (const taskId of ['.', '..', '../x', 'https://evil.example', 'x?key=y', 'x%2Fy', '', null])
    assert.throws(() => plugin.buildQueryRequest({ ...query, taskId }));
  assert.throws(() => plugin.buildQueryRequest({ ...query, state: undefined }));
  assert.throws(() => plugin.buildQueryRequest({ ...query, state: { project_id: '../other' } }));
});

test('maps Beeuni result status without treating unknown states as success', () => {
  for (const [status, expected] of [['pending', 'SUBMITTED'], ['running', 'IN_PROGRESS'], ['completed', 'SUCCESS'], ['failed', 'FAILURE']])
    assert.equal(plugin.parseTaskResult(query, { ...result, status }).status, expected);
  for (const body of [null, {}, { status: 'future_status' }])
    assert.deepEqual(plugin.parseTaskResult(query, body), { status: 'UNKNOWN' });
  assert.throws(() => plugin.parseTaskResult(query, { ...result, session_id: OTHER_PROJECT }));
  assert.throws(() => plugin.parseTaskResult(query, { ...result, output: [{ type: 'reasoning', text: 'private' }] }));
  assert.throws(() => plugin.parseTaskResult(query, { ...result, output: [{ type: 'text', text: 'a'.repeat(131073) }] }));
});

test('accepts safe results without an optional session ID', () => {
  const { session_id, ...safeResult } = result;
  assert.equal(plugin.parseTaskResult(query, safeResult).status, 'SUCCESS');
});

test('pricing reserves one task and charges one only on success', () => {
  assert.deepEqual(plugin.extractUsage(ctx), { tasks: 1 });
  assert.equal(plugin.extractUsage({ ...ctx, usagePurpose: 'billing_ratios' }), null);
  assert.deepEqual(plugin.extractUsageOnComplete(ctx, { status: 'SUCCESS' }), { tasks: 1 });
  assert.deepEqual(plugin.extractUsageOnComplete(ctx, { status: 'FAILURE' }), { tasks: 0 });
});

test('presenters expose public IDs and explicit safe fields', () => {
  const task = { task_id: 'task_gateway_1', status: 'SUCCESS', data: { ...result, private: 'private-token' } };
  assert.deepEqual(plugin.native.taskStatus({}, task), {
    id: 'task_gateway_1', model: 'beeuni-agent', status: 'SUCCESS',
    output: [{ type: 'text', text: '4' }], truncated: false, error: null,
  });
  const created = plugin.native.taskCreated({}, { ...task, status: 'SUBMITTED' });
  assert.equal(created.__status, 202);
  assert.deepEqual(created.__body.output, []);
  assert.equal(created.__headers['Retry-After'], '3');
});

test('errors never echo upstream details', () => {
  const value = plugin.native.error({}, { code: 'upstream_error', message: 'Bearer private-token' });
  assert.ok(!JSON.stringify(value).includes('private-token'));
  const failed = plugin.native.taskStatus({}, { task_id: 'public', status: 'FAILURE', fail_reason: 'private-token' });
  assert.ok(!JSON.stringify(failed).includes('private-token'));
});

test('unsupported text results have a clear error without echoing upstream messages', () => {
  const data = { ...result, status: 'failed', error: { code: 'text_result_unavailable', message: 'private-token' } };
  assert.match(plugin.parseTaskResult(query, data).reason, /without a supported text result/);
  const rendered = plugin.native.taskStatus({}, { task_id: 'public', status: 'FAILURE', data });
  assert.equal(rendered.error.code, 'text_result_unavailable');
  assert.ok(!JSON.stringify(rendered).includes('private-token'));
});
