import type { INodeProperties } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['media'], operation: operations },
});

const KIND_OPTIONS = [
	{ name: 'Image', value: 'image' },
	{ name: 'Video', value: 'video' },
	{ name: 'Audio', value: 'audio' },
	{ name: 'Document', value: 'document' },
	{ name: 'Sticker', value: 'sticker' },
];

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List media objects in the library',
				action: 'Get many media objects',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a reusable media object',
				action: 'Upload a media object',
			},
		],
		default: 'upload',
	},
];

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		options: [
			{
				name: 'Binary Data',
				value: 'binary',
				description: 'Upload a file carried on the incoming item',
			},
			{
				name: 'External URL',
				value: 'url',
				description: 'Have WA.cr fetch the file server-side',
			},
		],
		default: 'binary',
		displayOptions: showFor(['upload']),
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field containing the file to upload',
		displayOptions: { show: { resource: ['media'], operation: ['upload'], source: ['binary'] } },
	},
	{
		displayName: 'URL',
		name: 'externalUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/brochure.pdf',
		displayOptions: { show: { resource: ['media'], operation: ['upload'], source: ['url'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor(['upload']),
		options: [
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				options: KIND_OPTIONS,
				default: 'image',
				description:
					'Declare the media kind. Left unset, it is inferred — either way the bytes are magic-byte checked against WhatsApp\'s per-field limits.',
			},
			{
				displayName: 'File Name',
				name: 'filename',
				type: 'string',
				default: '',
			},
		],
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		displayOptions: showFor(['getAll']),
		options: [
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				options: KIND_OPTIONS,
				default: 'image',
			},
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
