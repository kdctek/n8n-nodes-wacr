import type { INodeProperties } from 'n8n-workflow';

import { templateLocator } from './locators';

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
		placeholder: 'e.g. +919876543210',
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
		placeholder: 'e.g. someone@example.com',
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
				name: 'Interactive',
				value: 'interactive',
				description: 'Buttons, lists, call-to-action links, Flows, location, address or products',
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
	templateLocator({
		displayName: 'Template',
		name: 'templateName',
		description: 'The approved template to send. Templates are addressed by name, with the language set below.',
		searchMethod: 'searchTemplateNames',
		placeholder: 'e.g. order_update',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	}),
	{
		// Loaded from the chosen template's own translations rather than typed —
		// a name exists once per language and guessing the code fails at send time.
		displayName: 'Language Name or ID',
		name: 'languageCode',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTemplateLanguages',
			// `.value` matters: templateName is a resourceLocator, and depending on
			// the bare name never fires when the picked value changes.
			loadOptionsDependsOn: ['templateName.value'],
		},
		required: true,
		default: 'en',
		// Wording is pinned by node-param-description-wrong-for-dynamic-options.
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	},
	{
		displayName: 'Variable Input',
		name: 'variableInput',
		type: 'options',
		options: [
			{
				name: 'Fields',
				value: 'mapped',
				description: 'Fill in the variables this template declares',
			},
			{
				name: 'Raw JSON',
				value: 'json',
				description: 'Supply the Cloud API components array yourself',
			},
		],
		default: 'mapped',
		description: 'How to bind the template\u2019s header, body and button variables',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['template'] }),
	},
	{
		// Slots come from the chosen template's own `components`, which
		// GET /v1/templates returns — see getTemplateVariables.
		displayName: 'Variables',
		name: 'templateVariables',
		type: 'resourceMapper',
		noDataExpression: true,
		default: { mappingMode: 'defineBelow', value: null },
		typeOptions: {
			loadOptionsDependsOn: ['templateName.value', 'languageCode'],
			resourceMapper: {
				resourceMapperMethod: 'getTemplateVariables',
				mode: 'add',
				fieldWords: { singular: 'variable', plural: 'variables' },
				addAllFields: true,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
		displayOptions: showFor({
			channel: ['whatsapp'],
			messageType: ['template'],
			variableInput: ['mapped'],
		}),
	},
	{
		displayName: 'Components',
		name: 'components',
		type: 'json',
		default: '[]',
		description:
			'Cloud API template components array binding header, body and button parameters. Leave empty for a template with no variables.',
		displayOptions: showFor({
			channel: ['whatsapp'],
			messageType: ['template'],
			variableInput: ['json'],
		}),
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
