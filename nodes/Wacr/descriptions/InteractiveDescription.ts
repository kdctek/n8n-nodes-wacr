import type { INodeProperties } from 'n8n-workflow';

/**
 * WhatsApp interactive messages.
 *
 * `POST /v1/messages` accepts `{ to, message }` where `message` is a full Cloud
 * API message object, so every interactive type reaches Meta unchanged. These
 * fields exist so users assemble that object from typed inputs instead of
 * hand-writing JSON — the Raw Message Object type stays as the escape hatch for
 * anything Meta ships before we model it.
 */

/** Interactive types that accept a header component. */
const WITH_HEADER = ['button', 'list', 'ctaUrl', 'flow', 'productList'];

/** Interactive types that accept a footer component. */
const WITH_FOOTER = ['button', 'list', 'ctaUrl', 'flow', 'product', 'productList'];

/** Every type except `product`, where body text is optional. */
const BODY_REQUIRED = [
	'button',
	'list',
	'ctaUrl',
	'flow',
	'locationRequest',
	'address',
	'productList',
];

const show = (extra: Record<string, string[]> = {}) => ({
	show: {
		resource: ['message'],
		operation: ['send'],
		channel: ['whatsapp'],
		messageType: ['interactive'],
		...extra,
	},
});

export const interactiveFields: INodeProperties[] = [
	{
		displayName: 'Interactive Type',
		name: 'interactiveType',
		type: 'options',
		// Order is fixed by the n8n linter (node-param-options-type-unsorted-items),
		// not chosen — it alphabetises by name.
		options: [
			{
				name: 'Address',
				value: 'address',
				description: 'Asks for a delivery address. India and Brazil only.',
			},
			{
				name: 'Call To Action URL',
				value: 'ctaUrl',
				description: 'A button that opens a link, without showing the raw URL',
			},
			{
				name: 'Flow',
				value: 'flow',
				description: 'Launches a published WhatsApp Flow',
			},
			{
				name: 'List',
				value: 'list',
				description: 'A menu of up to ten rows, grouped into sections',
			},
			{
				name: 'Location Request',
				value: 'locationRequest',
				description: 'Asks the recipient to share their location',
			},
			{
				name: 'Product',
				value: 'product',
				description: 'A single catalogue product',
			},
			{
				name: 'Product List',
				value: 'productList',
				description: 'Several catalogue products, grouped into sections',
			},
			{
				name: 'Reply Buttons',
				value: 'button',
				description: 'Up to three tappable reply buttons',
			},
		],
		default: 'button',
		displayOptions: show(),
	},

	/* ── header ───────────────────────────────────────────────────────────── */
	{
		displayName: 'Header Type',
		name: 'headerType',
		type: 'options',
		// Alphabetised by the n8n linter, which is why None sits mid-list.
		options: [
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'Location', value: 'location' },
			{ name: 'None', value: 'none' },
			{ name: 'Text', value: 'text' },
			{ name: 'Video', value: 'video' },
		],
		default: 'none',
		description: 'Optional component shown above the body. A product list always needs a text header.',
		displayOptions: show({ interactiveType: WITH_HEADER }),
	},
	{
		displayName: 'Header Text',
		name: 'headerText',
		type: 'string',
		default: '',
		placeholder: 'e.g. Your order is ready',
		description: 'Header line, up to 60 characters',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['text'] }),
	},
	{
		displayName: 'Header Media URL',
		name: 'headerMediaUrl',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://example.com/photo.jpg',
		description: 'Publicly reachable URL of the header media',
		displayOptions: show({
			interactiveType: WITH_HEADER,
			headerType: ['image', 'video', 'document'],
		}),
	},
	{
		displayName: 'Latitude',
		name: 'headerLatitude',
		type: 'string',
		default: '',
		placeholder: 'e.g. 19.076',
		description: 'Decimal degrees, positive for north',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['location'] }),
	},
	{
		displayName: 'Longitude',
		name: 'headerLongitude',
		type: 'string',
		default: '',
		placeholder: 'e.g. 72.8777',
		description: 'Decimal degrees, positive for east',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['location'] }),
	},
	{
		// Meta calls this `name`, not `title` — the label follows Meta so the
		// mapping stays obvious when someone reads the API docs alongside.
		displayName: 'Location Name',
		name: 'headerLocationName',
		type: 'string',
		default: '',
		placeholder: 'e.g. Gateway of India',
		description: 'Optional label shown above the address',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['location'] }),
	},
	{
		displayName: 'Address',
		name: 'headerLocationAddress',
		type: 'string',
		default: '',
		placeholder: 'e.g. Apollo Bandar, Colaba, Mumbai',
		description: 'Optional street address shown under the name',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['location'] }),
	},
	{
		displayName: 'Header Filename',
		name: 'headerFilename',
		type: 'string',
		default: '',
		placeholder: 'e.g. invoice.pdf',
		description: 'Filename shown to the recipient for a document header',
		displayOptions: show({ interactiveType: WITH_HEADER, headerType: ['document'] }),
	},

	/* ── body / footer ────────────────────────────────────────────────────── */
	{
		displayName: 'Body Text',
		name: 'interactiveBody',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		placeholder: 'e.g. Pick a delivery slot',
		description: 'Main text, up to 1024 characters',
		displayOptions: show({ interactiveType: BODY_REQUIRED }),
	},
	{
		displayName: 'Body Text',
		name: 'interactiveBody',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		placeholder: 'e.g. Back in stock',
		description: 'Optional text shown above the product',
		displayOptions: show({ interactiveType: ['product'] }),
	},
	{
		displayName: 'Footer Text',
		name: 'interactiveFooter',
		type: 'string',
		default: '',
		placeholder: 'e.g. Reply STOP to opt out',
		description: 'Small print below the body, up to 60 characters',
		displayOptions: show({ interactiveType: WITH_FOOTER }),
	},

	/* ── reply buttons ────────────────────────────────────────────────────── */
	{
		displayName: 'Buttons',
		name: 'buttons',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add button',
		default: {},
		description: 'Up to three buttons. Meta rejects the message if you add more.',
		displayOptions: show({ interactiveType: ['button'] }),
		options: [
			{
				displayName: 'Button',
				name: 'button',
				values: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						placeholder: 'e.g. Confirm',
						description: 'Button label, up to 20 characters',
						required: true,
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						placeholder: 'e.g. confirm',
						description:
							'Value echoed back when tapped. Defaults to the title lowercased with spaces replaced by underscores.',
					},
				],
			},
		],
	},

	/* ── list ─────────────────────────────────────────────────────────────── */
	{
		displayName: 'List Button Text',
		name: 'listButton',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. View slots',
		description: 'Label on the button that opens the list, up to 20 characters',
		displayOptions: show({ interactiveType: ['list'] }),
	},
	{
		displayName: 'Sections',
		name: 'listSections',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add section',
		default: {},
		description:
			'Up to 10 sections holding up to 10 rows in total — the row cap is cumulative across every section, not per section',
		displayOptions: show({ interactiveType: ['list'] }),
		options: [
			{
				displayName: 'Section',
				name: 'section',
				values: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						placeholder: 'e.g. Morning',
						description: 'Heading above this group of rows, up to 24 characters. Optional for a single unnamed section.',
					},
					{
						displayName: 'Rows',
						name: 'rows',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true, sortable: true },
						placeholder: 'Add row',
						default: {},
						options: [
							{
								displayName: 'Row',
								name: 'row',
								values: [
									{
										displayName: 'Title',
										name: 'title',
										type: 'string',
										default: '',
										placeholder: 'e.g. 9am to 11am',
										description: 'Row label, up to 24 characters',
										required: true,
									},
									{
										displayName: 'Description',
										name: 'description',
										type: 'string',
										default: '',
										placeholder: 'e.g. Fastest option',
										description: 'Secondary line, up to 72 characters',
									},
									{
										displayName: 'ID',
										name: 'id',
										type: 'string',
										default: '',
										placeholder: 'e.g. slot_9_11',
										description:
											'Value echoed back when chosen. Defaults to the title lowercased with spaces replaced by underscores.',
									},
								],
							},
						],
					},
				],
			},
		],
	},

	/* ── call to action URL ───────────────────────────────────────────────── */
	{
		displayName: 'Button Text',
		name: 'ctaDisplayText',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Track order',
		description: 'Label on the button that opens the link',
		displayOptions: show({ interactiveType: ['ctaUrl'] }),
	},
	{
		displayName: 'URL',
		name: 'ctaUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/orders/1234',
		description: 'Link the button opens',
		displayOptions: show({ interactiveType: ['ctaUrl'] }),
	},

	/* ── flow ─────────────────────────────────────────────────────────────── */
	{
		displayName: 'Flow ID',
		name: 'flowId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 1234567890',
		description: 'ID of the published Flow to launch',
		displayOptions: show({ interactiveType: ['flow'] }),
	},
	{
		displayName: 'Button Text',
		name: 'flowCta',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Book now',
		description: 'Label on the button that opens the Flow',
		displayOptions: show({ interactiveType: ['flow'] }),
	},
	{
		displayName: 'Flow Action',
		name: 'flowAction',
		type: 'options',
		options: [
			{ name: 'Navigate', value: 'navigate', description: 'Open a specific screen' },
			{
				name: 'Data Exchange',
				value: 'data_exchange',
				description: 'Let your endpoint decide the first screen',
			},
		],
		default: 'navigate',
		displayOptions: show({ interactiveType: ['flow'] }),
	},
	{
		displayName: 'Flow Options',
		name: 'flowOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: show({ interactiveType: ['flow'] }),
		options: [
			{
				displayName: 'Flow Token',
				name: 'flowToken',
				type: 'string',
				// Masked to satisfy node-param-type-options-password-missing; a flow
				// token can carry session-identifying data, so hiding it is fair.
				typeOptions: { password: true },
				default: '',
				description: 'Value your endpoint receives, to correlate the response. Defaults to unused.',
			},
			{
				displayName: 'Screen Name',
				name: 'screen',
				type: 'string',
				default: '',
				placeholder: 'e.g. WELCOME',
				description: 'First screen to open. Required when the action is Navigate.',
			},
			{
				displayName: 'Flow Action Payload',
				name: 'flowActionPayload',
				type: 'json',
				default: '{}',
				description: 'Data passed into the first screen',
			},
		],
	},

	/* ── address ──────────────────────────────────────────────────────────── */
	{
		displayName: 'Country',
		name: 'addressCountry',
		type: 'options',
		options: [
			{ name: 'India', value: 'IN' },
			{ name: 'Brazil', value: 'BR' },
		],
		default: 'IN',
		description: 'Meta supports the address message in these two countries only',
		displayOptions: show({ interactiveType: ['address'] }),
	},

	/* ── product / product list ───────────────────────────────────────────── */
	{
		displayName: 'Catalogue ID',
		name: 'catalogId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 1234567890',
		description: 'ID of the Meta catalogue holding the products',
		displayOptions: show({ interactiveType: ['product', 'productList'] }),
	},
	{
		displayName: 'Product Retailer ID',
		name: 'productRetailerId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. SKU-1234',
		description: 'Your own SKU for the product, as uploaded to the catalogue',
		displayOptions: show({ interactiveType: ['product'] }),
	},
	{
		displayName: 'Products',
		name: 'productItems',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add product',
		default: {},
		description:
			'Products sharing a section title are grouped together, in the order the titles first appear',
		displayOptions: show({ interactiveType: ['productList'] }),
		options: [
			{
				displayName: 'Product',
				name: 'product',
				values: [
					{
						displayName: 'Section Title',
						name: 'sectionTitle',
						type: 'string',
						default: '',
						placeholder: 'e.g. Best sellers',
						description: 'Groups products under a heading. Leave empty for a single unnamed section.',
					},
					{
						displayName: 'Product Retailer ID',
						name: 'productRetailerId',
						type: 'string',
						default: '',
						placeholder: 'e.g. SKU-1234',
						description: 'Your own SKU for the product, as uploaded to the catalogue',
						required: true,
					},
				],
			},
		],
	},
];
