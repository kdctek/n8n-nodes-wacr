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
				description: 'Add an internal note to a conversation',
				action: 'Add a note',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the internal notes on a conversation',
				action: 'Get many notes',
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
			'Whose conversation to annotate. Notes are channel-agnostic — they hang off the contact, not a channel. By ID also accepts a business short ID or E.164 digits.',
		displayOptions: showFor(['add', 'getAll']),
	}),
	{
		displayName: 'Note',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description:
			'Note text in WhatsApp markup, up to 4096 characters. Never sent to the customer. May be empty only when attachments are given.',
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
				description: 'A message UUID in this conversation that the note is about',
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
					'Only notes updated after this instant. Deleted notes come back as tombstones so a delta poll can drop them.',
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
