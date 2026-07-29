import type { INodeProperties } from 'n8n-workflow';

const showFor = (extra: Record<string, string[]> = {}) => ({
	show: { resource: ['message'], operation: ['send'], ...extra },
});

export const messageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{
				name: 'Send',
				value: 'send',
				description: 'Send a message to one recipient',
				action: 'Send a message',
			},
		],
		default: 'send',
	},
];

export const messageFields: INodeProperties[] = [
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'options',
		options: [
			{ name: 'WhatsApp', value: 'whatsapp' },
			{ name: 'Email', value: 'email' },
		],
		default: 'whatsapp',
		description: 'Transport to send over. Further channels exist in the API but are not yet dispatchable.',
		displayOptions: showFor(),
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+919876543210',
		description:
			'Recipient in E.164 (with or without +), WhatsApp ID digits, a business short ID, or a WA.cr contact UUID',
		displayOptions: showFor({ channel: ['whatsapp'] }),
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'someone@example.com',
		description: 'Recipient email address, or a WA.cr contact UUID',
		displayOptions: showFor({ channel: ['email'] }),
	},

	/* ── WhatsApp ─────────────────────────────────────────────────────────── */
	{
		displayName: 'Message Type',
		name: 'messageType',
		type: 'options',
		options: [
			{
				name: 'Text',
				value: 'text',
				description: 'Plain text — only deliverable inside an open 24-hour service window',
			},
			{
				name: 'Template',
				value: 'template',
				description: 'An approved template — the only way to open a new conversation',
			},
			{
				name: 'Raw Message Object',
				value: 'raw',
				description: 'A full Cloud API message object, for types this node does not model',
			},
		],
		default: 'text',
		displayOptions: showFor({ channel: ['whatsapp'] }),
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'Message body, up to 4096 characters',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['text'] }),
	},
	{
		displayName: 'Template Name or ID',
		name: 'templateName',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplateNames' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	},
	{
		displayName: 'Language Code',
		name: 'languageCode',
		type: 'string',
		required: true,
		default: 'en',
		placeholder: 'en_US',
		description: 'Language of the approved template, e.g. en, en_US or hi',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	},
	{
		displayName: 'Components',
		name: 'components',
		type: 'json',
		default: '[]',
		description:
			'Cloud API template components array binding header, body and button parameters. Leave empty for a template with no variables.',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	},
	{
		displayName: 'Message Object',
		name: 'message',
		type: 'json',
		required: true,
		default: '{\n  "type": "image",\n  "image": {\n    "link": "https://example.com/photo.jpg"\n  }\n}',
		description: 'A full Cloud API message object of the form { type, &lt;type&gt;: { … } }',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['raw'] }),
	},

	/* ── Email ────────────────────────────────────────────────────────────── */
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		displayOptions: showFor({ channel: ['email'] }),
	},
	{
		displayName: 'HTML Body',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		description: 'Email body as HTML',
		displayOptions: showFor({ channel: ['email'] }),
	},

	/* ── shared ───────────────────────────────────────────────────────────── */
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor({ channel: ['whatsapp'] }),
		options: [
			{
				displayName: 'Reply to Message ID',
				name: 'contextMessageId',
				type: 'string',
				default: '',
				description: 'The provider message ID (wamid) this message replies to',
			},
		],
	},
];
