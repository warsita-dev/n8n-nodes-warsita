import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { p, sessionOf, warsitaRequest } from '../Warsita/transport';

const EVENTS: Array<[string, string]> = [
	['messages.received', 'Any message received'],
	['messages-personal.received', 'Personal message received'],
	['messages-group.received', 'Group message received'],
	['messages-newsletter.received', 'Channel message received'],
	['message.sent', 'Message sent'],
	['message.status', 'Message status changed (sent, delivered, read, failed)'],
	['message-receipt.update', 'Receipt received'],
	['messages.update', 'Message edited'],
	['messages.delete', 'Message deleted'],
	['messages.reaction', 'Reaction'],
	['poll.vote', 'Poll vote'],
	['call', 'Incoming call'],
	['session.status', 'Session status changed'],
	['qrcode.updated', 'New QR code'],
	['groups.update', 'Group changed'],
	['group-participants.update', 'Group participants changed'],
	['chats.update', 'Chat changed (archived, pinned, muted, read)'],
	['chats.delete', 'Chat deleted'],
	['contacts.update', 'Contact changed'],
];

interface WebhookConfig {
	url: string;
	secret: string;
	events: string[];
}

interface StaticData extends IDataObject {
	secret?: string;
	previous?: { url: string; events: string[] };
}

// Signatures older than this are refused, which stops replays.
const TOLERANCE_SECONDS = 300;

export class WarsitaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Warsita Trigger',
		name: 'warsitaTrigger',
		icon: { light: 'file:../../icons/warsita.svg', dark: 'file:../../icons/warsita.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when a WhatsApp event happens on a Warsita session',
		defaults: { name: 'Warsita Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'warsitaApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName:
					"Needs a personal access token and a Session ID in the credential. On activation the trigger points the session's webhook at n8n; a session has one webhook URL.",
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['messages.received'],
				options: EVENTS.map(([value, name]) => ({ name, value })),
			},
			{
				displayName: 'Replace Existing Webhook',
				name: 'replaceExisting',
				type: 'boolean',
				default: false,
				description:
					'Whether to take over a webhook URL the session already sends to. It is put back when the workflow is deactivated.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const current = await getWebhook.call(this);
				const events = this.getNodeParameter('events') as string[];
				if (current.url !== this.getNodeWebhookUrl('default') || !sameSet(current.events, events)) {
					return false;
				}
				(this.getWorkflowStaticData('node') as StaticData).secret = current.secret;
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const data = this.getWorkflowStaticData('node') as StaticData;
				const current = await getWebhook.call(this);
				if (current.url && current.url !== url) {
					if (!this.getNodeParameter('replaceExisting')) {
						throw new NodeOperationError(
							this.getNode(),
							`The session already sends its webhook to ${current.url}. Turn on Replace Existing Webhook to use this trigger instead.`,
						);
					}
					data.previous = { url: current.url, events: current.events };
				}
				const saved = await putWebhook.call(this, url, this.getNodeParameter('events') as string[]);
				data.secret = saved.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				const current = await getWebhook.call(this);
				if (current.url === this.getNodeWebhookUrl('default')) {
					const previous = data.previous;
					await putWebhook.call(this, previous?.url ?? '', previous?.events ?? current.events);
				}
				delete data.secret;
				delete data.previous;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = (this.getWorkflowStaticData('node') as StaticData).secret ?? '';
		const raw =
			(req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
			JSON.stringify(req.body);
		if (!validSignature(raw, req.headers['x-warsita-signature'] as string | undefined, secret)) {
			this.getResponseObject().status(401).json({ error: 'invalid signature' });
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}

async function sessionPath(this: IHookFunctions): Promise<string> {
	const sessionId = await sessionOf.call(this);
	if (!sessionId) {
		throw new NodeOperationError(
			this.getNode(),
			"The Warsita Trigger manages the session's webhook, which needs a personal access token (wsp_…) and a Session ID in the credential.",
		);
	}
	return `/v1/sessions/${p(sessionId)}/webhook`;
}

async function getWebhook(this: IHookFunctions): Promise<WebhookConfig> {
	const res = (await warsitaRequest.call(this, {
		method: 'GET',
		path: await sessionPath.call(this),
	})) as {
		webhook: WebhookConfig;
	};
	return res.webhook;
}

async function putWebhook(
	this: IHookFunctions,
	url: string,
	events: string[],
): Promise<WebhookConfig> {
	const res = (await warsitaRequest.call(this, {
		method: 'PUT',
		path: await sessionPath.call(this),
		body: { url, events },
	})) as { webhook: WebhookConfig };
	return res.webhook;
}

function sameSet(a: string[] = [], b: string[] = []): boolean {
	return a.length === b.length && a.every((v) => b.includes(v));
}

/** Checks X-Warsita-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">. */
export function validSignature(
	body: string,
	header: string | undefined,
	secret: string,
	now = Date.now(),
): boolean {
	if (!header || !secret) return false;
	const parts = Object.fromEntries(
		header.split(',').map((kv) => {
			const at = kv.indexOf('=');
			return [kv.slice(0, at).trim(), kv.slice(at + 1).trim()];
		}),
	);
	const t = Number(parts.t);
	if (!/^\d+$/.test(parts.t ?? '') || Math.abs(now / 1000 - t) > TOLERANCE_SECONDS) return false;
	const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest();
	const given = Buffer.from(parts.v1 ?? '', 'hex');
	return given.length === expected.length && timingSafeEqual(given, expected);
}
