import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getTemplateLanguages,
	getTemplateNames,
	getTemplateVariables,
	getTemplates,
	searchChannels,
	searchContacts,
	searchTemplateNames,
	searchTemplates,
	parseJsonArrayParameter,
	parseJsonParameter,
	toList,
	wacrApiRequest,
} from './GenericFunctions';

import { broadcastFields, broadcastOperations } from './descriptions/BroadcastDescription';
import { commentFields, commentOperations } from './descriptions/CommentDescription';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { interactiveFields } from './descriptions/InteractiveDescription';
import { mediaFields, mediaOperations } from './descriptions/MediaDescription';
import { messageFields, messageOperations } from './descriptions/MessageDescription';
import { templateFields, templateOperations } from './descriptions/TemplateDescription';
import { buildInteractiveMessage } from './interactive';
import { buildComponentsFromValues } from './templateVariables';

export class Wacr implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WA.cr',
		name: 'wacr',
		icon: { light: 'file:wacrIcon.svg', dark: 'file:wacrIcon.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send messages and manage contacts, templates, broadcasts and media in WA.cr',
		defaults: { name: 'WA.cr' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'wacrApi',
				required: true,
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
			{
				name: 'wacrOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'API Key', value: 'apiKey' },
					{ name: 'OAuth2', value: 'oAuth2' },
				],
				default: 'apiKey',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Broadcast', value: 'broadcast' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Media', value: 'media' },
					{ name: 'Message', value: 'message' },
					{ name: 'Note', value: 'comment' },
					{ name: 'Template', value: 'template' },
				],
				default: 'message',
			},
			...messageOperations,
			...messageFields,
			...interactiveFields,
			...contactOperations,
			...contactFields,
			...commentOperations,
			...commentFields,
			...templateOperations,
			...templateFields,
			...broadcastOperations,
			...broadcastFields,
			...mediaOperations,
			...mediaFields,
		],
	};

	methods = {
		loadOptions: { getTemplates, getTemplateNames, getTemplateLanguages },
		listSearch: { searchChannels, searchContacts, searchTemplates, searchTemplateNames },
		resourceMapping: { getTemplateVariables },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const results = await executeOne.call(this, resource, operation, i);
				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Errors raised through the API transport or a parameter check already
				// carry node context and are rethrown as-is. Anything else would surface
				// as a bare message with no indication of which node produced it, so it
				// gets wrapped.
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				throw failure;
			}
		}

		return [returnData];
	}
}

/** Run one resource/operation for a single input item. Returns the rows to emit. */
async function executeOne(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	switch (resource) {
		case 'message':
			return [await sendMessage.call(this, i)];
		case 'contact':
			return contactOperation.call(this, operation, i);
		case 'comment':
			return commentOperation.call(this, operation, i);
		case 'template':
			return templateOperation.call(this, operation, i);
		case 'broadcast':
			return broadcastOperation.call(this, operation, i);
		case 'media':
			return mediaOperation.call(this, operation, i);
		default:
			throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
				itemIndex: i,
			});
	}
}

/* ── message ──────────────────────────────────────────────────────────────── */

async function sendMessage(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const channel = this.getNodeParameter('channel', i) as string;
	const body: IDataObject = { channel, to: this.getNodeParameter('to', i) as string };

	if (channel === 'email') {
		body.subject = this.getNodeParameter('subject', i) as string;
		body.html = this.getNodeParameter('html', i) as string;
		return wacrApiRequest.call(this, 'POST', '/v1/messages', body);
	}

	// Optional, and WhatsApp-only — the API refuses `from` on other channels
	// rather than ignoring it, so it is read after the email branch has returned.
	// Omitting it keeps WA.cr's default routing, which is what a single-number
	// workspace wants and what every already-published workflow relies on.
	const from = this.getNodeParameter('from', i, '', { extractValue: true }) as string;
	if (from) body.from = from;

	const messageType = this.getNodeParameter('messageType', i) as string;
	if (messageType === 'text') {
		body.text = this.getNodeParameter('text', i) as string;
	} else if (messageType === 'interactive') {
		body.message = buildInteractiveMessage.call(this, i);
	} else if (messageType === 'template') {
		body.templateName = this.getNodeParameter('templateName', i, undefined, { extractValue: true }) as string;
		body.languageCode = this.getNodeParameter('languageCode', i) as string;

		// Mapped fields are the default; raw JSON stays available for templates the
		// mapper reads wrongly, and for anything Meta adds before we model it.
		const variableInput = this.getNodeParameter('variableInput', i, 'mapped') as string;
		const components =
			variableInput === 'json'
				? parseJsonArrayParameter.call(this, this.getNodeParameter('components', i, '[]'), 'Components')
				: buildComponentsFromValues(
						((this.getNodeParameter('templateVariables', i, {}) as IDataObject).value ??
							{}) as IDataObject,
					);
		if (components.length) body.components = components;
	} else {
		body.message = parseJsonParameter.call(this, this.getNodeParameter('message', i), 'Message Object');
	}

	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	if (options.contextMessageId) body.contextMessageId = options.contextMessageId;

	return wacrApiRequest.call(this, 'POST', '/v1/messages', body);
}

/* ── contact ──────────────────────────────────────────────────────────────── */

/** Shape the free-text/JSON fields of a contact payload. */
function contactPayload(this: IExecuteFunctions, fields: IDataObject): IDataObject {
	const body: IDataObject = {};
	if (fields.displayName) body.displayName = fields.displayName;
	if (fields.email) body.email = fields.email;
	if (fields.tags !== undefined) {
		const tags = toList(fields.tags as string);
		if (tags.length) body.tags = tags;
	}
	if (fields.attributes !== undefined) {
		body.attributes = parseJsonParameter.call(this, fields.attributes, 'Attributes');
	}
	if (fields.optedOut !== undefined) body.optedOut = fields.optedOut;
	return body;
}

async function contactOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'upsert': {
			const body = contactPayload.call(this, this.getNodeParameter('fields', i, {}) as IDataObject);
			body.phoneE164 = this.getNodeParameter('phoneE164', i) as string;
			return [await wacrApiRequest.call(this, 'POST', '/v1/contacts', body)];
		}
		case 'get': {
			const id = this.getNodeParameter('contactId', i, undefined, { extractValue: true }) as string;
			const response = await wacrApiRequest.call(this, 'GET', `/v1/contacts/${id}`);
			return [(response.contact as IDataObject) ?? response];
		}
		case 'getAll': {
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
			if (filters.q) qs.q = filters.q;
			if (filters.tag) qs.tag = filters.tag;
			const response = await wacrApiRequest.call(this, 'GET', '/v1/contacts', {}, qs);
			return (response.contacts as IDataObject[]) ?? [];
		}
		case 'update': {
			const id = this.getNodeParameter('contactId', i, undefined, { extractValue: true }) as string;
			const body = contactPayload.call(this, this.getNodeParameter('updateFields', i, {}) as IDataObject);
			if (!Object.keys(body).length) {
				throw new NodeOperationError(this.getNode(), 'Set at least one field to update.', {
					itemIndex: i,
				});
			}
			return [await wacrApiRequest.call(this, 'PATCH', `/v1/contacts/${id}`, body)];
		}
		case 'delete': {
			const id = this.getNodeParameter('contactId', i, undefined, { extractValue: true }) as string;
			const response = await wacrApiRequest.call(this, 'DELETE', `/v1/contacts/${id}`);
			// n8n's UX guidelines ask a delete to return { deleted: true }, so the
			// branch still carries an item when the API answers with an empty body.
			return [{ deleted: true, ...response }];
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown contact operation: ${operation}`, {
				itemIndex: i,
			});
	}
}

/* ── note (internal conversation comment) ─────────────────────────────────── */

async function commentOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	const contact = encodeURIComponent(this.getNodeParameter('contact', i, undefined, { extractValue: true }) as string);
	const endpoint = `/v1/conversations/${contact}/comments`;

	if (operation === 'add') {
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const body: IDataObject = { body: this.getNodeParameter('body', i, '') as string };
		const mentions = toList(options.mentions as string);
		const mediaIds = toList(options.mediaIds as string);
		if (mentions.length) body.mentions = mentions;
		if (mediaIds.length) body.mediaIds = mediaIds;
		if (options.refMessageId) body.refMessageId = options.refMessageId;
		const response = await wacrApiRequest.call(this, 'POST', endpoint, body);
		return [(response.comment as IDataObject) ?? response];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
		if (filters.after) qs.after = filters.after;
		const response = await wacrApiRequest.call(this, 'GET', endpoint, {}, qs);
		return (response.comments as IDataObject[]) ?? [];
	}

	throw new NodeOperationError(this.getNode(), `Unknown note operation: ${operation}`, {
		itemIndex: i,
	});
}

/* ── template ─────────────────────────────────────────────────────────────── */

async function templateOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'getAll') {
		const response = await wacrApiRequest.call(this, 'GET', '/v1/templates');
		return (response.templates as IDataObject[]) ?? [];
	}

	if (operation === 'create') {
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const body: IDataObject = {
			name: this.getNodeParameter('name', i) as string,
			language: this.getNodeParameter('language', i) as string,
			category: this.getNodeParameter('category', i) as string,
			components: parseJsonArrayParameter.call(this, this.getNodeParameter('components', i), 'Components'),
		};
		if (options.parameterFormat) body.parameterFormat = options.parameterFormat;
		if (options.wabaId) body.wabaId = options.wabaId;
		return [await wacrApiRequest.call(this, 'POST', '/v1/templates', body)];
	}

	throw new NodeOperationError(this.getNode(), `Unknown template operation: ${operation}`, {
		itemIndex: i,
	});
}

/* ── broadcast ────────────────────────────────────────────────────────────── */

async function broadcastOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'getAll') {
		const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
		const response = await wacrApiRequest.call(this, 'GET', '/v1/broadcasts', {}, qs);
		return (response.broadcasts as IDataObject[]) ?? [];
	}

	if (operation === 'create') {
		const recipients = this.getNodeParameter('recipients', i, {}) as IDataObject;
		const contactIds = toList(recipients.contactIds as string);
		if (!recipients.groupId && !contactIds.length) {
			throw new NodeOperationError(
				this.getNode(),
				'Give a group ID, a list of contact IDs, or both.',
				{ itemIndex: i },
			);
		}
		const body: IDataObject = {
			name: this.getNodeParameter('name', i) as string,
			templateId: this.getNodeParameter('templateId', i, undefined, { extractValue: true }) as string,
			variables: parseJsonParameter.call(this, this.getNodeParameter('variables', i, '{}'), 'Variables'),
		};
		if (recipients.groupId) body.groupId = recipients.groupId;
		if (contactIds.length) body.contactIds = contactIds;
		return [await wacrApiRequest.call(this, 'POST', '/v1/broadcasts', body)];
	}

	throw new NodeOperationError(this.getNode(), `Unknown broadcast operation: ${operation}`, {
		itemIndex: i,
	});
}

/* ── media ────────────────────────────────────────────────────────────────── */

async function mediaOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
		if (filters.kind) qs.kind = filters.kind;
		const response = await wacrApiRequest.call(this, 'GET', '/v1/media', {}, qs);
		return (response.media as IDataObject[]) ?? [];
	}

	if (operation === 'upload') {
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const source = this.getNodeParameter('source', i) as string;

		if (source === 'url') {
			const body: IDataObject = { externalUrl: this.getNodeParameter('externalUrl', i) as string };
			if (options.kind) body.kind = options.kind;
			if (options.filename) body.filename = options.filename;
			const response = await wacrApiRequest.call(this, 'POST', '/v1/media/upload', body);
			return [(response.media as IDataObject) ?? response];
		}

		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
		const fileName = (options.filename as string) || binary.fileName || 'file';

		// Native FormData so the transport sets the multipart boundary itself —
		// json must stay off or the body would be re-encoded as JSON.
		const form = new FormData();
		form.append('file', new Blob([buffer], { type: binary.mimeType || 'application/octet-stream' }), fileName);
		if (options.kind) form.append('kind', options.kind as string);

		const response = await wacrApiRequest.call(
			this,
			'POST',
			'/v1/media/upload',
			{},
			{},
			{ body: form as unknown as IDataObject, json: false },
		);
		return [(response.media as IDataObject) ?? response];
	}

	throw new NodeOperationError(this.getNode(), `Unknown media operation: ${operation}`, {
		itemIndex: i,
	});
}
