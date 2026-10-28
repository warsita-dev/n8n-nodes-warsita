import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { p, warsitaRequest } from './transport';

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

const messageFields: INodeProperties[] = [
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+6281234567890',
		description:
			'A phone number with its country code, or a WhatsApp ID (…@s.whatsapp.net, …@lid, a group …@g.us)',
		displayOptions: show('message', ['send']),
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		default: 'text',
		options: [
			{ name: 'Audio', value: 'audio' },
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'Location', value: 'location' },
			{ name: 'Poll', value: 'poll' },
			{ name: 'Text', value: 'text' },
			{ name: 'Video', value: 'video' },
		],
		displayOptions: show('message', ['send']),
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['text'] } },
	},
	{
		displayName: 'Media URL',
		name: 'mediaUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/receipt.png',
		description: 'A public URL Warsita downloads the file from',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['send'],
				type: ['image', 'video', 'audio', 'document'],
			},
		},
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['send'], type: ['image', 'video', 'document'] },
		},
	},
	{
		displayName: 'File Name',
		name: 'filename',
		type: 'string',
		default: '',
		placeholder: 'invoice.pdf',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['document'] } },
	},
	{
		displayName: 'Voice Note',
		name: 'ptt',
		type: 'boolean',
		default: false,
		description: 'Whether to send the audio as a voice note',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['audio'] } },
	},
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'number',
		typeOptions: { numberPrecision: 6 },
		required: true,
		default: 0,
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'number',
		typeOptions: { numberPrecision: 6 },
		required: true,
		default: 0,
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
	},
	{
		displayName: 'Place Name',
		name: 'locationName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
	},
	{
		displayName: 'Question',
		name: 'pollName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['poll'] } },
	},
	{
		displayName: 'Options',
		name: 'pollOptions',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'The answers, one per line (2 to 12)',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['poll'] } },
	},
	{
		displayName: 'Allow Multiple Answers',
		name: 'pollMultiple',
		type: 'boolean',
		default: false,
		description: 'Whether people may pick more than one answer',
		displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['poll'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('message', ['send']),
		options: [
			{
				displayName: 'Mentions',
				name: 'mentions',
				type: 'string',
				default: '',
				description:
					'Phone numbers to mention in a group, separated by commas; write @ and the number in the text too',
			},
			{
				displayName: 'Reply To Message ID',
				name: 'replyTo',
				type: 'string',
				default: '',
				description: 'The WhatsApp message ID to quote',
			},
			{
				displayName: 'Reply To Sender',
				name: 'replySender',
				type: 'string',
				default: '',
				description: 'In a group: who wrote the quoted message',
			},
			{
				displayName: 'Rotate Sender',
				name: 'rotate',
				type: 'boolean',
				default: false,
				description:
					"Whether to send from the workspace's sender rotation, the number in rotation that wrote to this person longest ago, instead of the credential's session. Needs a personal access token; people only, without a reply.",
			},
			{
				displayName: 'View Once',
				name: 'viewOnce',
				type: 'boolean',
				default: false,
				description: 'Whether the image, video or audio can be opened only once',
			},
		],
	},
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'msg_…',
		displayOptions: show('message', ['get', 'edit', 'delete', 'react']),
	},
	{
		displayName: 'Text',
		name: 'newText',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'The new text; a message can be edited within 20 minutes of sending',
		displayOptions: show('message', ['edit']),
	},
	{
		displayName: 'Emoji',
		name: 'emoji',
		type: 'string',
		default: '👍',
		description: 'One emoji; leave empty to remove the reaction',
		displayOptions: show('message', ['react']),
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		default: '',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Delivered', value: 'delivered' },
			{ name: 'Failed', value: 'failed' },
			{ name: 'Queued', value: 'queued' },
			{ name: 'Read', value: 'read' },
			{ name: 'Sent', value: 'sent' },
		],
		displayOptions: show('message', ['getAll']),
	},
];

const returnAllFields = (resource: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(resource, ['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
	},
];

export class Warsita implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Warsita',
		name: 'warsita',
		icon: { light: 'file:../../icons/warsita.svg', dark: 'file:../../icons/warsita.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and read contacts and groups with Warsita',
		defaults: { name: 'Warsita' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'warsitaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Group', value: 'group' },
					{ name: 'Message', value: 'message' },
				],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{ name: 'Delete', value: 'delete', action: 'Delete a message for everyone' },
					{ name: 'Edit', value: 'edit', action: 'Edit a message' },
					{ name: 'Get', value: 'get', action: 'Get a message' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many messages' },
					{ name: 'React', value: 'react', action: 'React to a message' },
					{ name: 'Send', value: 'send', action: 'Send a message' },
				],
				default: 'send',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{
						name: 'Check Numbers',
						value: 'check',
						action: 'Check which numbers use whats app',
					},
					{ name: 'Get', value: 'get', action: 'Get a contact' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many contacts' },
				],
				default: 'check',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['group'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a group' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many groups' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [{ name: 'Get', value: 'get', action: 'Get the linked account' }],
				default: 'get',
			},
			...messageFields,
			...returnAllFields('message'),
			{
				displayName: 'Phone Numbers',
				name: 'phones',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+6281234567890, +6289876543210',
				description: 'Up to 50 phone numbers with their country code, separated by commas',
				displayOptions: show('contact', ['check']),
			},
			{
				displayName: 'Contact',
				name: 'jid',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+6281234567890',
				description: 'A phone number with its country code, or a WhatsApp ID',
				displayOptions: show('contact', ['get']),
			},
			...returnAllFields('contact'),
			{
				displayName: 'Group ID',
				name: 'groupJid',
				type: 'string',
				required: true,
				default: '',
				placeholder: '120363012345678901@g.us',
				displayOptions: show('group', ['get']),
			},
			...returnAllFields('group'),
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const result = await run.call(this, i);
				const list = Array.isArray(result) ? result : [result ?? { success: true }];
				out.push(...list.map((json) => ({ json: json as IDataObject, pairedItem: { item: i } })));
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}

async function run(this: IExecuteFunctions, i: number): Promise<unknown> {
	const resource = this.getNodeParameter('resource', i) as string;
	const operation = this.getNodeParameter('operation', i) as string;
	const param = (name: string) => this.getNodeParameter(name, i) as string;

	if (resource === 'message') {
		const id = () => p(param('messageId'));
		switch (operation) {
			case 'send': {
				const body = messageBody.call(this, i);
				return warsitaRequest.call(this, {
					method: 'POST',
					path: '/v1/messages',
					body,
					headers: idempotencyKey.call(this, i),
					// A rotated message names no session: the workspace's rotation picks it.
					scoped: !body.rotate,
				});
			}
			case 'get':
				// No session needed, so messages sent with rotation are found too.
				return warsitaRequest.call(this, { method: 'GET', path: `/v1/messages/${id()}` });
			case 'edit':
				return warsitaRequest.call(this, {
					method: 'PATCH',
					path: `/v1/messages/${id()}`,
					body: { text: param('newText') },
					scoped: true,
				});
			case 'delete':
				return warsitaRequest.call(this, {
					method: 'DELETE',
					path: `/v1/messages/${id()}`,
					scoped: true,
				});
			case 'react':
				return warsitaRequest.call(this, {
					method: 'POST',
					path: '/v1/messages/react',
					body: { message_id: param('messageId'), emoji: param('emoji') },
					scoped: true,
				});
			case 'getAll':
				return listMessages.call(this, i);
		}
	}
	if (resource === 'contact') {
		switch (operation) {
			case 'check':
				return warsitaRequest.call(this, {
					method: 'POST',
					path: '/v1/contacts/check',
					body: { phones: splitList(param('phones')) },
					scoped: true,
				});
			case 'get':
				return warsitaRequest.call(this, {
					method: 'GET',
					path: `/v1/contacts/${p(param('jid'))}`,
					scoped: true,
				});
			case 'getAll':
				return limited.call(
					this,
					i,
					await warsitaRequest.call(this, { method: 'GET', path: '/v1/contacts', scoped: true }),
				);
		}
	}
	if (resource === 'group') {
		switch (operation) {
			case 'get':
				return warsitaRequest.call(this, {
					method: 'GET',
					path: `/v1/groups/${p(param('groupJid'))}`,
					scoped: true,
				});
			case 'getAll':
				return limited.call(
					this,
					i,
					await warsitaRequest.call(this, { method: 'GET', path: '/v1/groups', scoped: true }),
				);
		}
	}
	if (resource === 'account' && operation === 'get') {
		return warsitaRequest.call(this, { method: 'GET', path: '/v1/account', scoped: true });
	}
	throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource} ${operation}`, {
		itemIndex: i,
	});
}

function messageBody(this: IExecuteFunctions, i: number): IDataObject {
	const param = <T>(name: string, fallback?: T) => this.getNodeParameter(name, i, fallback) as T;
	const type = param<string>('type');
	const body: IDataObject = { to: param<string>('to') };
	switch (type) {
		case 'text':
			body.text = param<string>('text');
			break;
		case 'image':
		case 'video':
		case 'audio':
		case 'document': {
			const media: IDataObject = { url: param<string>('mediaUrl') };
			if (type !== 'audio' && param<string>('caption', ''))
				media.caption = param<string>('caption');
			if (type === 'document' && param<string>('filename', ''))
				media.filename = param<string>('filename');
			if (type === 'audio' && param<boolean>('ptt', false)) media.ptt = true;
			body[type] = media;
			break;
		}
		case 'location':
			body.location = {
				latitude: param<number>('latitude'),
				longitude: param<number>('longitude'),
				...(param<string>('locationName', '') ? { name: param<string>('locationName') } : {}),
			};
			break;
		case 'poll':
			body.poll = {
				name: param<string>('pollName'),
				options: param<string>('pollOptions')
					.split('\n')
					.map((o) => o.trim())
					.filter(Boolean),
				selectable_count: param<boolean>('pollMultiple', false) ? 0 : 1,
			};
			break;
	}
	const extra = param<IDataObject>('additionalFields', {});
	if (extra.mentions) body.mentions = splitList(String(extra.mentions));
	if (extra.replyTo) {
		body.reply_to = {
			id: extra.replyTo,
			...(extra.replySender ? { sender: extra.replySender } : {}),
		};
	}
	if (extra.viewOnce) body.view_once = true;
	if (extra.rotate) body.rotate = true;
	return body;
}

// Retry On Fail runs the node again in the same execution; the same key makes the API answer
// with the message it already queued instead of sending it twice.
function idempotencyKey(this: IExecuteFunctions, i: number): IDataObject {
	const execution = this.getExecutionId();
	return execution ? { 'Idempotency-Key': `n8n-${execution}-${this.getNode().id}-${i}` } : {};
}

async function listMessages(this: IExecuteFunctions, i: number): Promise<unknown[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
	const status = this.getNodeParameter('status', i) as string;
	const all: IDataObject[] = [];
	let before: string | undefined;
	while (all.length < limit) {
		const page = (await warsitaRequest.call(this, {
			method: 'GET',
			path: '/v1/messages',
			qs: {
				limit: Math.min(100, limit - all.length),
				...(status ? { status } : {}),
				...(before ? { before } : {}),
			},
			scoped: true,
		})) as IDataObject[];
		all.push(...page);
		if (page.length === 0 || page.length < Math.min(100, limit - all.length + page.length)) break;
		before = String(page[page.length - 1].id);
	}
	return all;
}

function limited(this: IExecuteFunctions, i: number, list: unknown): unknown[] {
	const items = Array.isArray(list) ? list : [];
	if (this.getNodeParameter('returnAll', i)) return items;
	return items.slice(0, this.getNodeParameter('limit', i) as number);
}

function splitList(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}
