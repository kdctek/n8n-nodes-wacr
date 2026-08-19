import type { INodeProperties } from 'n8n-workflow';

import { contactLocator } from './locators';

const showFor = (operations: string[]) => ({
	show: { resource: ['contact'], operation: operations },
});

/**
 * Attribute bag controls, shared by both write paths.
 *
 * The API writes `attributes` WHOLESALE on either verb — a key you leave out is
 * erased. Merge reads the contact first and folds the supplied keys over the
 * stored ones, which costs one extra request against the rate limit but keeps
 * every custom field the workspace already captured.
 */
const attributeFields: INodeProperties[] = [
	{
		displayName: 'Attributes',
		name: 'attributes',
		type: 'json',
		default: '{}',
		description:
			'Custom attributes as a JSON object, keyed by the field name the workspace defined (e.g. {"loyalty_tier": "gold"})',
	},
	{
		displayName: 'Attributes Mode',
		name: 'attributesMode',
		type: 'options',
		default: 'replace',
		description: 'What happens to attributes the contact already carries',
		options: [
			{
				name: 'Merge',
				value: 'merge',
				description:
					'Read the contact first and fold these keys over the stored ones. Costs one extra request.',
			},
			{
				name: 'Replace',
				value: 'replace',
				description: 'Send only these attributes. Every key you leave out is erased.',
			},
		],
	},
];

const nameFields: INodeProperties[] = [
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
];

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
		displayName: 'Method',
		name: 'method',
		type: 'options',
		default: 'POST',
		description: 'How the write reaches the workspace',
		displayOptions: showFor(['upsert']),
		options: [
			{
				name: 'Create or Update (POST)',
				value: 'POST',
				description:
					'Match on the phone number and create the contact when it is new. Names and tags are written wholesale — omit tags and the contact is left with none.',
			},
			{
				name: 'Update Only (PATCH)',
				value: 'PATCH',
				description:
					'Update a contact that already exists, addressed by ID. Only the fields you fill in are touched; the call fails if the contact is gone.',
			},
		],
	},
	{
		displayName: 'Phone Number',
		name: 'phoneE164',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +919876543210',
		description: 'E.164 with the leading +. This is the key the upsert matches on.',
		displayOptions: { show: { resource: ['contact'], operation: ['upsert'], method: ['POST'] } },
	},
	contactLocator({
		displayName: 'Contact',
		name: 'contactId',
		description: 'The contact to update',
		displayOptions: { show: { resource: ['contact'], operation: ['upsert'], method: ['PATCH'] } },
	}),
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['upsert'], method: ['POST'] } },
		options: [
			...attributeFields,
			...nameFields,
			{
				displayName: 'Source',
				name: 'source',
				type: 'string',
				default: '',
				placeholder: 'e.g. shopify or landing-page',
				description:
					'Where the contact came from, shown as the "Via …" badge. Stamped when the contact is CREATED and never rewritten. Use an integration kind (shopify, woocommerce, qtap) to get its brand badge, or a short slug of your own, which is stored as api:your-slug. Platform values are refused.',
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

	/* ── update (PATCH), from either the Update operation or Create or Update ── */
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['update']),
		options: updateFieldOptions(),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['upsert'], method: ['PATCH'] } },
		options: updateFieldOptions(),
	},

	/* ── addresses (both write paths) ─────────────────────────────────────── */
	{
		displayName: 'Addresses',
		name: 'addresses',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add address',
		default: {},
		description:
			'Addresses to ADD to the contact. The list is append-only — nothing you send here replaces or removes an address the contact already shared, and an entry identical to a stored one is dropped rather than duplicated.',
		displayOptions: showFor(['upsert', 'update']),
		options: [
			{
				displayName: 'Address',
				name: 'address',
				values: [
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						placeholder: 'e.g. Home',
						description: 'Your own name for this address',
					},
					{
						displayName: 'Purpose',
						name: 'purpose',
						type: 'options',
						default: '',
						description: 'Leave it unclassified when the address is neither, or both',
						options: [
							{ name: 'Billing', value: 'billing' },
							{ name: 'Shipping', value: 'shipping' },
							{ name: 'Unclassified', value: '' },
						],
					},
					{
						displayName: 'Recipient Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'e.g. Asha Menon',
						description: 'Who receives at this address, when it is not the contact themselves',
					},
					{
						displayName: 'Recipient Mobile',
						name: 'mobile',
						type: 'string',
						default: '',
						placeholder: 'e.g. +919876543210',
						description:
							'Delivery number for this address. It is not an identity — it never becomes a way to message the contact.',
					},
					{
						displayName: 'Recipient Email',
						name: 'email',
						type: 'string',
						placeholder: 'e.g. name@email.com',
						default: '',
						description: 'Delivery email for this address, not the contact’s own',
					},
					{
						displayName: 'Address Line 1',
						name: 'addressLine1',
						type: 'string',
						default: '',
						placeholder: 'e.g. Flat 4B, Sea Breeze Apartments',
						description: 'Flat, house, floor or building',
					},
					{
						displayName: 'Address Line 2',
						name: 'addressLine2',
						type: 'string',
						default: '',
						placeholder: 'e.g. Off Turner Road, Bandra West',
						description: 'Street, landmark or area',
					},
					{ displayName: 'City', name: 'city', type: 'string', default: '', placeholder: 'e.g. Mumbai' },
					{ displayName: 'State', name: 'state', type: 'string', default: '', placeholder: 'e.g. Maharashtra' },
					{ displayName: 'Pincode', name: 'pincode', type: 'string', default: '', placeholder: 'e.g. 400050' },
					{
						displayName: 'Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'e.g. IN',
						description: 'ISO two-letter code or a country name. It is resolved to the code on save.',
					},
					{
						displayName: 'Latitude',
						name: 'latitude',
						type: 'string',
						default: '',
						placeholder: 'e.g. 19.0607',
						description: 'Give it together with the longitude, or leave both empty',
					},
					{
						displayName: 'Longitude',
						name: 'longitude',
						type: 'string',
						default: '',
						placeholder: 'e.g. 72.8362',
						description: 'Give it together with the latitude, or leave both empty',
					},
					{
						displayName: 'DIGIPIN',
						name: 'digipin',
						type: 'string',
						default: '',
						placeholder: 'e.g. 39J-49L-L8T4',
						description:
							'India Post DIGIPIN. Leave it empty and it is worked out from the coordinates when they fall inside India.',
					},
					{
						displayName: 'Delivery Instruction',
						name: 'instruction',
						type: 'string',
						default: '',
						placeholder: 'e.g. Ring the bell twice',
					},
				],
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

/**
 * The PATCH field set. Built by a function rather than shared by reference so
 * the two collections that use it (the Update operation, and Create or Update
 * on the PATCH method) can never mutate each other's options.
 */
function updateFieldOptions(): INodeProperties[] {
	return [
		...attributeFields,
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
	];
}
