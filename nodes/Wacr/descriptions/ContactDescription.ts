import type { INodeProperties } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['contact'], operation: operations },
});

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a contact',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a contact — conversation history is retained',
				action: 'Delete a contact',
			},
			{ name: 'Get', value: 'get', description: 'Get one contact by ID', action: 'Get a contact' },
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List contacts, optionally filtered',
				action: 'Get many contacts',
			},
			{ name: 'Update', value: 'update', description: 'Update a contact', action: 'Update a contact' },
		],
		default: 'upsert',
	},
];

export const contactFields: INodeProperties[] = [
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		description: 'The contact UUID returned by Get Many or Create or Update',
		displayOptions: showFor(['get', 'update', 'delete']),
	},

	/* ── create or update ─────────────────────────────────────────────────── */
	{
		displayName: 'Phone Number',
		name: 'phoneE164',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+919876543210',
		description: 'E.164 with the leading +. This is the key the upsert matches on.',
		displayOptions: showFor(['upsert']),
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['upsert']),
		options: [
			{
				displayName: 'Attributes',
				name: 'attributes',
				type: 'json',
				default: '{}',
				description: 'Custom attributes as a JSON object',
			},
			{ displayName: 'Display Name', name: 'displayName', type: 'string', default: '' },
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'vip, newsletter',
				description: 'Comma-separated list of tags',
			},
		],
	},

	/* ── update ───────────────────────────────────────────────────────────── */
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Attributes',
				name: 'attributes',
				type: 'json',
				default: '{}',
				description: 'Custom attributes as a JSON object. Replaces the existing attributes.',
			},
			{ displayName: 'Display Name', name: 'displayName', type: 'string', default: '' },
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
			{
				displayName: 'Opted Out',
				name: 'optedOut',
				type: 'boolean',
				default: false,
				description: 'Whether the contact is opted out of marketing messages',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'vip, newsletter',
				description: 'Comma-separated list of tags. Replaces the existing tags.',
			},
		],
	},

	/* ── get many ─────────────────────────────────────────────────────────── */
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		displayOptions: showFor(['getAll']),
		options: [
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Match against name, phone number or email',
			},
			{ displayName: 'Tag', name: 'tag', type: 'string', default: '' },
		],
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: showFor(['getAll']),
	},
];
