import type { INodeProperties } from 'n8n-workflow';

import { templateLocator } from './locators';

const showFor = (operations: string[]) => ({
	show: { resource: ['broadcast'], operation: operations },
});

export const broadcastOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['broadcast'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create and dispatch a broadcast to a group or a list of contacts',
				action: 'Create a broadcast',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List broadcasts and their delivery counts',
				action: 'Get many broadcasts',
			},
		],
		default: 'getAll',
	},
];

export const broadcastFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Label shown in the console broadcast list',
		displayOptions: showFor(['create']),
	},
	templateLocator({
		displayName: 'Template',
		name: 'templateId',
		description: 'The approved template this broadcast sends',
		searchMethod: 'searchTemplates',
		placeholder: 'e.g. 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071',
		displayOptions: showFor(['create']),
	}),
	{
		displayName: 'Variables',
		name: 'variables',
		type: 'json',
		default: '{}',
		description: 'Template bindings for the header, body parameters, buttons and carousel',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Recipients',
		name: 'recipients',
		type: 'collection',
		placeholder: 'Add recipients',
		default: {},
		description:
			'Target by group, by explicit contacts, or both. Dispatch is synchronous and capped at 500 recipients.',
		displayOptions: showFor(['create']),
		options: [
			{
				displayName: 'Group ID',
				name: 'groupId',
				type: 'string',
				default: '',
				description: 'UUID of a contact group to send to',
			},
			{
				displayName: 'Contact IDs',
				name: 'contactIds',
				type: 'string',
				default: '',
				description: 'Comma-separated contact UUIDs',
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
