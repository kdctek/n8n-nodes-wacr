import type { INodeProperties } from 'n8n-workflow';

import { senderLocator, templateLocator } from './locators';

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
	senderLocator({
		displayName: 'From',
		name: 'from',
		description:
			'Which of the workspace’s WhatsApp numbers to send as. Leave empty to let WA.cr choose: it replies on the number the conversation arrived on, else the workspace default. Setting this also narrows the template pickers to that number’s WhatsApp Business Account.',
		displayOptions: showFor({ channel: ['whatsapp'] }),
	}),
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
				description: 'Plain text. Needs an open 24-hour service window.',
			},
			{
				name: 'Template',
				value: 'template',
				description: 'An approved template — the only way to open a new conversation',
			},
			{
				name: 'Interactive',
				value: 'interactive',
				description:
					'Buttons, lists, links, Flows, location, address or products. Needs an open 24-hour service window.',
			},
			{
				name: 'Raw Message Object',
				value: 'raw',
				description:
					'A full Cloud API message object, for types this node does not model. Needs an open 24-hour service window unless it is a template.',
			},
		],
		default: 'text',
		displayOptions: showFor({ channel: ['whatsapp'] }),
	},
	{
		displayName:
			'Everything except <b>Template</b> only reaches the contact inside an open <b>24-hour service window</b> — that is, within 24 hours of their last inbound message. <b>If the window has closed this node still reports success</b>: WA.cr accepts the message and the failure appears later in WA.cr, not here. Send a Template to open a new conversation.',
		name: 'windowNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor({ channel: ['whatsapp'], messageType: ['text', 'interactive', 'raw'] }),
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
			// `.value` matters: both of these are resourceLocators, and depending on
			// the bare name never fires when the picked value changes.
			// `from` is here because changing the sender changes which WABA's
			// templates are visible, and so which translations of a name exist.
			loadOptionsDependsOn: ['templateName.value', 'from.value'],
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
			loadOptionsDependsOn: ['templateName.value', 'languageCode', 'from.value'],
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
		// Details about the RECIPIENT, not the sender. Messaging someone the
		// workspace has never spoken to creates their contact, and these name it
		// in the same call instead of a second round-trip to /v1/contacts. They
		// never change the message itself.
		displayName: 'Contact Details',
		name: 'contactDetails',
		type: 'collection',
		placeholder: 'Add detail',
		default: {},
		description:
			'Details to store on the recipient’s contact. Messaging someone new creates their contact record, and these name it in the same call.',
		displayOptions: showFor(),
		options: [
			{
				displayName: 'Display Name',
				name: 'displayName',
				type: 'string',
				default: '',
				description:
					'An explicit label for the inbox, such as “Asha M. (VIP)”. Leave it empty and the label mirrors the first and last name. A label typed into WA.cr by hand is never overwritten.',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. name@email.com',
				default: '',
				description:
					'Email address to store on the contact. On the Email channel this has to be the same address as To — the API refuses a different one rather than picking a winner.',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Asha',
				description: 'Given name. The inbox label is built from this and the last name.',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Menon',
				description: 'Family name. The inbox label is built from this and the first name.',
			},
			{
				displayName: 'Replace Existing Details',
				name: 'override',
				type: 'boolean',
				default: false,
				description:
					'Whether to overwrite details the contact already has. Off, a detail they are missing is still filled in and one they already carry is left alone. On a brand-new contact everything is empty, so this makes no difference.',
			},
		],
	},
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
