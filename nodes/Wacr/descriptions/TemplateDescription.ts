import type { INodeProperties } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['template'], operation: operations },
});

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a template and submit it to Meta for approval',
				action: 'Create a template',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List message templates and their approval status',
				action: 'Get many templates',
			},
		],
		default: 'getAll',
	},
];

export const templateFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. order_update',
		description: 'Lowercase letters, digits and underscores only',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'string',
		required: true,
		default: 'en',
		placeholder: 'e.g. en_US',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Category',
		name: 'category',
		type: 'options',
		options: [
			{ name: 'Marketing', value: 'MARKETING' },
			{ name: 'Utility', value: 'UTILITY' },
			{ name: 'Authentication', value: 'AUTHENTICATION' },
		],
		default: 'UTILITY',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Components',
		name: 'components',
		type: 'json',
		required: true,
		default:
			'[\n  {\n    "type": "BODY",\n    "text": "Hi {{1}}, your order is on its way."\n  }\n]',
		description:
			'Cloud API components array. Validated locally, then submitted to Meta — approval is asynchronous.',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor(['create']),
		options: [
			{
				displayName: 'Parameter Format',
				name: 'parameterFormat',
				type: 'options',
				options: [
					{ name: 'Positional', value: 'POSITIONAL' },
					{ name: 'Named', value: 'NAMED' },
				],
				default: 'POSITIONAL',
			},
			{
				displayName: 'WABA ID',
				name: 'wabaId',
				type: 'string',
				default: '',
				description:
					'Which WhatsApp Business Account to submit to. Only needed when the workspace has more than one.',
			},
		],
	},
];
