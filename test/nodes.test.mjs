import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { Warsita } from '../dist/nodes/Warsita/Warsita.node.js';
import {
	WarsitaTrigger,
	validSignature,
} from '../dist/nodes/WarsitaTrigger/WarsitaTrigger.node.js';

// fakeContext is enough of n8n's node context: parameters, a credential, and an HTTP helper
// that records each request and answers with the next response.
function fakeContext({
	params = {},
	credentials = { apiKey: 'wsk_test', baseUrl: 'https://api.warsita.com' },
	responses = [],
} = {}) {
	const calls = [];
	const staticData = {};
	return {
		calls,
		staticData,
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => credentials,
		getNode: () => ({ id: 'node-1', name: 'Warsita' }),
		getExecutionId: () => 'exec-1',
		continueOnFail: () => false,
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc/webhook',
		getWorkflowStaticData: () => staticData,
		helpers: {
			httpRequestWithAuthentication: async (credentialType, options) => {
				assert.equal(credentialType, 'warsitaApi');
				calls.push(options);
				return responses.length ? responses.shift() : {};
			},
		},
	};
}

test('send builds the message body, adds an idempotency key and unwraps data', async () => {
	const ctx = fakeContext({
		params: {
			resource: 'message',
			operation: 'send',
			to: '+6281234567890',
			type: 'document',
			mediaUrl: 'https://example.com/invoice.pdf',
			caption: 'Your invoice',
			filename: 'invoice.pdf',
			additionalFields: { replyTo: '3EB0ABC', mentions: '+628111, +628222' },
		},
		responses: [{ data: { id: 'msg_1', status: 'queued' } }],
	});
	const [[item]] = await new Warsita().execute.call(ctx);
	assert.deepEqual(item.json, { id: 'msg_1', status: 'queued' });
	const [call] = ctx.calls;
	assert.equal(call.method, 'POST');
	assert.equal(call.url, 'https://api.warsita.com/v1/messages');
	assert.equal(call.headers['Idempotency-Key'], 'n8n-exec-1-node-1-0');
	assert.deepEqual(call.body, {
		to: '+6281234567890',
		document: {
			url: 'https://example.com/invoice.pdf',
			caption: 'Your invoice',
			filename: 'invoice.pdf',
		},
		mentions: ['+628111', '+628222'],
		reply_to: { id: '3EB0ABC' },
	});
});

test('a poll takes one option per line', async () => {
	const ctx = fakeContext({
		params: {
			resource: 'message',
			operation: 'send',
			to: '+6281234567890',
			type: 'poll',
			pollName: 'Which day?',
			pollOptions: 'Friday\n\n Saturday \n',
			pollMultiple: false,
		},
	});
	await new Warsita().execute.call(ctx);
	assert.deepEqual(ctx.calls[0].body.poll, {
		name: 'Which day?',
		options: ['Friday', 'Saturday'],
		selectable_count: 1,
	});
});

test('a personal access token adds the session: in the body for POST, in the query otherwise', async () => {
	const credentials = {
		apiKey: 'wsp_token',
		sessionId: 'ses_a',
		baseUrl: 'https://api.warsita.com/',
	};
	const send = fakeContext({
		credentials,
		params: {
			resource: 'message',
			operation: 'send',
			to: '+6281234567890',
			type: 'text',
			text: 'Hi',
		},
	});
	await new Warsita().execute.call(send);
	assert.equal(send.calls[0].body.session_id, 'ses_a');

	const groups = fakeContext({
		credentials,
		params: { resource: 'group', operation: 'getAll', returnAll: false, limit: 1 },
		responses: [{ data: [{ jid: 'a@g.us' }, { jid: 'b@g.us' }] }],
	});
	const [out] = await new Warsita().execute.call(groups);
	assert.equal(groups.calls[0].url, 'https://api.warsita.com/v1/groups');
	assert.deepEqual(groups.calls[0].qs, { session_id: 'ses_a' });
	assert.deepEqual(
		out.map((i) => i.json.jid),
		['a@g.us'],
	);

	const missing = fakeContext({
		credentials: { apiKey: 'wsp_token' },
		params: { resource: 'account', operation: 'get' },
	});
	await assert.rejects(new Warsita().execute.call(missing), /Session ID/);
});

test('rotate sends without the session, and get needs none', async () => {
	const credentials = { apiKey: 'wsp_token', sessionId: 'ses_a', baseUrl: 'https://api.warsita.com' };
	const send = fakeContext({
		credentials,
		params: {
			resource: 'message',
			operation: 'send',
			to: '+6281234567890',
			type: 'text',
			text: 'Hi',
			additionalFields: { rotate: true },
		},
		responses: [{ data: { id: 'msg_1', from: '+6281100000001' } }],
	});
	const [[out]] = await new Warsita().execute.call(send);
	assert.deepEqual(send.calls[0].body, { to: '+6281234567890', text: 'Hi', rotate: true });
	assert.equal(out.json.from, '+6281100000001');

	const get = fakeContext({
		credentials: { apiKey: 'wsp_token', baseUrl: 'https://api.warsita.com' },
		params: { resource: 'message', operation: 'get', messageId: 'msg_1' },
	});
	await new Warsita().execute.call(get);
	assert.deepEqual(get.calls[0].qs, {});
});

test('path parameters are escaped', async () => {
	const ctx = fakeContext({
		params: { resource: 'group', operation: 'get', groupJid: '120363012345678901@g.us' },
	});
	await new Warsita().execute.call(ctx);
	assert.equal(ctx.calls[0].url, 'https://api.warsita.com/v1/groups/120363012345678901%40g.us');
});

test('get many messages pages back with before', async () => {
	const page = (from, n) => ({
		data: Array.from({ length: n }, (_, k) => ({ id: `msg_${from + k}` })),
	});
	const ctx = fakeContext({
		params: { resource: 'message', operation: 'getAll', returnAll: true, status: '' },
		responses: [page(0, 100), page(100, 3)],
	});
	const [out] = await new Warsita().execute.call(ctx);
	assert.equal(out.length, 103);
	assert.equal(ctx.calls[1].qs.before, 'msg_99');
});

const tokenCredentials = {
	apiKey: 'wsp_token',
	sessionId: 'ses_a',
	baseUrl: 'https://api.warsita.com',
};
const ours = 'https://n8n.example.com/webhook/abc/webhook';

test('the trigger refuses to take over another webhook unless asked, and puts it back', async () => {
	const methods = new WarsitaTrigger().webhookMethods.default;
	const existing = {
		webhook: {
			url: 'https://crm.example.com/hook',
			secret: 'whsec_old',
			events: ['messages.received'],
		},
	};

	const refused = fakeContext({
		credentials: tokenCredentials,
		params: { events: ['messages.received'], replaceExisting: false },
		responses: [existing],
	});
	await assert.rejects(
		methods.create.call(refused),
		/already sends its webhook to https:\/\/crm\.example\.com\/hook/,
	);
	assert.equal(refused.calls.length, 1);

	const ctx = fakeContext({
		credentials: tokenCredentials,
		params: { events: ['messages.received', 'poll.vote'], replaceExisting: true },
		responses: [
			existing,
			{ webhook: { url: ours, secret: 'whsec_old', events: ['messages.received', 'poll.vote'] } },
		],
	});
	assert.equal(await methods.create.call(ctx), true);
	assert.equal(ctx.calls[1].method, 'PUT');
	assert.equal(ctx.calls[1].url, 'https://api.warsita.com/v1/sessions/ses_a/webhook');
	assert.deepEqual(ctx.calls[1].body, { url: ours, events: ['messages.received', 'poll.vote'] });
	assert.equal(ctx.staticData.secret, 'whsec_old');

	ctx.calls.length = 0;
	ctx.helpers.httpRequestWithAuthentication = async (_t, options) => {
		ctx.calls.push(options);
		return {
			webhook: { url: ours, secret: 'whsec_old', events: ['messages.received', 'poll.vote'] },
		};
	};
	await methods.delete.call(ctx);
	assert.deepEqual(ctx.calls[1].body, {
		url: 'https://crm.example.com/hook',
		events: ['messages.received'],
	});
	assert.deepEqual(ctx.staticData, {});
});

test('the trigger needs a personal access token', async () => {
	const ctx = fakeContext({ params: { events: ['messages.received'] } });
	await assert.rejects(
		new WarsitaTrigger().webhookMethods.default.create.call(ctx),
		/personal access token/,
	);
});

test('checkExists matches the URL and the events', async () => {
	const check = new WarsitaTrigger().webhookMethods.default.checkExists;
	const answer = (events) =>
		fakeContext({
			credentials: tokenCredentials,
			params: { events: ['poll.vote', 'call'] },
			responses: [{ webhook: { url: ours, secret: 's', events } }],
		});
	assert.equal(await check.call(answer(['call', 'poll.vote'])), true);
	assert.equal(await check.call(answer(['call'])), false);
});

test('validSignature accepts a valid signature and refuses forged or old ones', () => {
	const secret = 'whsec_test';
	const body = JSON.stringify({ event: 'messages.received', data: { text: 'Hi' } });
	const t = Math.floor(Date.now() / 1000);
	const sig = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
	assert.equal(validSignature(body, sig, secret), true);
	assert.equal(validSignature(body, sig, 'whsec_other'), false);
	assert.equal(validSignature(body + ' ', sig, secret), false);
	assert.equal(validSignature(body, sig, secret, (t + 600) * 1000), false);
	assert.equal(validSignature(body, undefined, secret), false);
	assert.equal(validSignature(body, 't=abc,v1=00', secret), false);
});
