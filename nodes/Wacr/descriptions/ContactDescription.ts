import type { INodeProperties } from 'n8n-workflow';

import { contactLocator } from './locators';

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
	contactLocator({
		displayName: 'Contact',
		name: 'contactId',
		description: 'The contact to act on',
		displayOptions: showFor(['get', 'update', 'delete']),
	}),

	/* ── create or update ─────────────────────────────────────────────────── */
	{
		displayName: 'Phone Number',
		name: 'phoneE164',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +919876543210',
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
			{
				displayName: 'Display Name',
				name: 'displayName',
				type: 'string',
				default: '',
				description:
					'An explicit label for the inbox. Leave it empty and the label mirrors the first and last name.',
			},
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'e.g. name@email.com', default: '' },
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
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. vip, newsletter',
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
			{
				displayName: 'Display Name',
				name: 'displayName',
				type: 'string',
				default: '',
				description:
					'An explicit label for the inbox. Setting it stops the label mirroring the first and last name.',
			},
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'e.g. name@email.com', default: '' },
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Asha',
				description:
					'Given name. Changing it refreshes the inbox label, unless an explicit display name was set.',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Menon',
				description:
					'Family name. Changing it refreshes the inbox label, unless an explicit display name was set.',
			},
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
				placeholder: 'e.g. vip, newsletter',
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
