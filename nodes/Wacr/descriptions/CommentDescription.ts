import type { INodeProperties } from 'n8n-workflow';

import { contactOrPhoneLocator } from './locators';

const showFor = (operations: string[]) => ({
	show: { resource: ['comment'], operation: operations },
});

export const commentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['comment'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description: 'Add an internal comment to a conversation',
				action: 'Add a comment',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the internal comments on a conversation',
				action: 'Get many comments',
			},
		],
		default: 'add',
	},
];

export const commentFields: INodeProperties[] = [
	contactOrPhoneLocator({
		displayName: 'Contact',
		name: 'contact',
		description:
			'Whose conversation to annotate. Comments are channel-agnostic — they hang off the contact, not a channel. Address them by ID, mobile number or email address; By ID also accepts a business short ID.',
		displayOptions: showFor(['add', 'getAll']),
	}),
	{
		displayName: 'Comment',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description:
			'Comment text in WhatsApp markup, up to 4096 characters. Never sent to the customer. May be empty only when attachments are given.',
		displayOptions: showFor(['add']),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor(['add']),
		options: [
			{
				displayName: 'Mentions',
				name: 'mentions',
				type: 'string',
				default: '',
				description:
					'Comma-separated workspace member user IDs. Each is notified by email and WhatsApp.',
			},
			{
				displayName: 'Media IDs',
				name: 'mediaIds',
				type: 'string',
				default: '',
				description: 'Comma-separated media UUIDs to attach, up to 10',
			},
			{
				displayName: 'Anchor Message ID',
				name: 'refMessageId',
				type: 'string',
				default: '',
				description: 'A message UUID in this conversation that the comment is about',
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
				displayName: 'Updated After',
				name: 'after',
				type: 'dateTime',
				default: '',
				description:
					'Only comments updated after this instant. Deleted comments come back as tombstones so a delta poll can drop them.',
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
