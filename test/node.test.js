/**
 * Functional tests for the compiled node.
 *
 * A throwaway HTTP server stands in for api.wa.cr and records what arrived, so
 * these assert the thing that actually breaks in production: which endpoint a
 * given operation hits, and exactly what body it sends.
 *
 * Run `npm run build` first — these load from dist/.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { Wacr } = require('../dist/nodes/Wacr/Wacr.node.js');
const { WacrTrigger } = require('../dist/nodes/WacrTrigger/WacrTrigger.node.js');

/* ── mock WA.cr ───────────────────────────────────────────────────────────── */

function startServer(handler) {
	return new Promise((resolve) => {
		const received = [];
		const server = http.createServer((req, res) => {
			const chunks = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => {
				const raw = Buffer.concat(chunks);
				const url = new URL(req.url, 'http://localhost');
				const entry = {
					method: req.method,
					path: url.pathname,
					query: Object.fromEntries(url.searchParams),
					headers: req.headers,
					raw,
					body: raw.length && req.headers['content-type']?.includes('json')
						? JSON.parse(raw.toString())
						: undefined,
				};
				received.push(entry);
				const { status = 200, json = { ok: true } } = handler?.(entry) ?? {};
				res.writeHead(status, { 'content-type': 'application/json' });
				res.end(JSON.stringify(json));
			});
		});
		server.listen(0, '127.0.0.1', () => {
			resolve({ server, received, port: server.address().port });
		});
	});
}

/* ── fake IExecuteFunctions ───────────────────────────────────────────────── */

function makeContext({ port, params, items = [{ json: {} }], binary }) {
	const baseUrl = `http://127.0.0.1:${port}`;
	return {
		getInputData: () => items,
		getNode: () => ({
			id: 'test-node',
			name: 'WA.cr',
			type: '@kdctek/n8n-nodes-wacr.wacr',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		continueOnFail: () => false,
		getNodeParameter(name, _i, fallback) {
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`test did not set parameter '${name}'`);
		},
		getCredentials: async () => ({ environment: 'custom', customBaseUrl: baseUrl, apiKey: 'wacr_test_x' }),
		helpers: {
			assertBinaryData: () => binary.meta,
			getBinaryDataBuffer: async () => binary.buffer,
			// Stands in for n8n's authenticated transport: same options object, and
			// the same json-on/off semantics the node relies on.
			async httpRequestWithAuthentication(_credName, options) {
				const url = new URL(options.url);
				for (const [k, v] of Object.entries(options.qs ?? {})) {
					url.searchParams.set(k, String(v));
				}
				const init = {
					method: options.method,
					headers: { ...options.headers, Authorization: 'Bearer wacr_test_x' },
				};
				if (options.body !== undefined) {
					if (options.json === false) {
						init.body = options.body;
					} else {
						init.body = JSON.stringify(options.body);
						init.headers['content-type'] = 'application/json';
					}
				}
				const response = await fetch(url, init);
				const text = await response.text();
				if (!response.ok) {
					const error = new Error(`Request failed with status ${response.status}`);
					error.response = { status: response.status, body: JSON.parse(text) };
					throw error;
				}
				return options.json === false ? text : JSON.parse(text);
			},
		},
	};
}

/** Run one operation and hand back the emitted rows plus what the server saw. */
async function run({ params, handler, items, binary }) {
	const { server, received, port } = await startServer(handler);
	try {
		const ctx = makeContext({ port, params, items, binary });
		const output = await new Wacr().execute.call(ctx);
		return { rows: output[0], received };
	} finally {
		server.close();
	}
}

const base = { authentication: 'apiKey' };

/* ── messages ─────────────────────────────────────────────────────────────── */

test('message: whatsapp text posts to /v1/messages', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'text',
			text: 'Hello',
			options: {},
		},
		handler: () => ({ json: { ok: true, id: 'msg-1', providerMessageId: 'wamid.X' } }),
	});

	assert.strictEqual(received.length, 1);
	assert.strictEqual(received[0].method, 'POST');
	assert.strictEqual(received[0].path, '/v1/messages');
	assert.deepStrictEqual(received[0].body, {
		channel: 'whatsapp',
		to: '+919876543210',
		text: 'Hello',
	});
	assert.strictEqual(rows[0].json.providerMessageId, 'wamid.X');
	assert.deepStrictEqual(rows[0].pairedItem, { item: 0 });
});

test('message: template send carries components and reply context', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '919876543210',
			messageType: 'template',
			templateName: 'order_update',
			languageCode: 'en',
			variableInput: 'json',
			components: '[{"type":"body","parameters":[{"type":"text","text":"Sam"}]}]',
			options: { contextMessageId: 'wamid.PREV' },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		channel: 'whatsapp',
		to: '919876543210',
		templateName: 'order_update',
		languageCode: 'en',
		components: [{ type: 'body', parameters: [{ type: 'text', text: 'Sam' }] }],
		contextMessageId: 'wamid.PREV',
	});
});

test('message: an empty components array is omitted, not sent as []', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '919876543210',
			messageType: 'template',
			templateName: 'welcome',
			languageCode: 'en',
			components: '[]',
			options: {},
		},
	});

	assert.ok(!('components' in received[0].body));
});

test('message: email send carries subject and html', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'email',
			to: 'sam@example.com',
			subject: 'Your order',
			html: '<p>Shipped</p>',
		},
	});

	assert.deepStrictEqual(received[0].body, {
		channel: 'email',
		to: 'sam@example.com',
		subject: 'Your order',
		html: '<p>Shipped</p>',
	});
});

/* ── interactive messages ─────────────────────────────────────────────────── */

/** Every interactive test sends the same envelope; only `message` differs. */
function interactive(params) {
	return {
		...base,
		resource: 'message',
		operation: 'send',
		channel: 'whatsapp',
		to: '+919876543210',
		messageType: 'interactive',
		options: {},
		...params,
	};
}

test('interactive: reply buttons carry header, footer and slugged default IDs', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'button',
			headerType: 'text',
			headerText: 'Order 1234',
			interactiveBody: 'Confirm your order',
			interactiveFooter: 'Reply STOP to opt out',
			buttons: { button: [{ title: 'Yes' }, { title: 'No thanks' }] },
		}),
	});

	assert.deepStrictEqual(received[0].body.message, {
		type: 'interactive',
		interactive: {
			header: { type: 'text', text: 'Order 1234' },
			body: { text: 'Confirm your order' },
			footer: { text: 'Reply STOP to opt out' },
			type: 'button',
			action: {
				buttons: [
					{ type: 'reply', reply: { id: 'yes', title: 'Yes' } },
					{ type: 'reply', reply: { id: 'no_thanks', title: 'No thanks' } },
				],
			},
		},
	});
});

test('interactive: list groups rows into sections by section title, in first-seen order', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'list',
			interactiveBody: 'Pick a delivery slot',
			listButton: 'View slots',
			listRows: {
				row: [
					{ sectionTitle: 'Morning', title: '9am to 11am', description: 'Fastest' },
					{ sectionTitle: 'Evening', title: '5pm to 7pm', id: 'eve' },
					{ sectionTitle: 'Morning', title: '11am to 1pm' },
				],
			},
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action, {
		button: 'View slots',
		sections: [
			{
				title: 'Morning',
				rows: [
					{ id: '9am_to_11am', title: '9am to 11am', description: 'Fastest' },
					{ id: '11am_to_1pm', title: '11am to 1pm' },
				],
			},
			{ title: 'Evening', rows: [{ id: 'eve', title: '5pm to 7pm' }] },
		],
	});
});

test('interactive: an unnamed section omits the title key entirely', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'list',
			interactiveBody: 'Choose',
			listButton: 'Open',
			listRows: { row: [{ title: 'Only option' }] },
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action.sections, [
		{ rows: [{ id: 'only_option', title: 'Only option' }] },
	]);
});

test('interactive: cta_url nests display text and url under parameters', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'ctaUrl',
			interactiveBody: 'Your parcel is on its way',
			ctaDisplayText: 'Track order',
			ctaUrl: 'https://example.com/orders/1234',
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive, {
		body: { text: 'Your parcel is on its way' },
		type: 'cta_url',
		action: {
			name: 'cta_url',
			parameters: { display_text: 'Track order', url: 'https://example.com/orders/1234' },
		},
	});
});

test('interactive: flow pins version 3 and nests screen + parsed data in the payload', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'flow',
			interactiveBody: 'Book an appointment',
			flowId: '1234567890',
			flowCta: 'Book now',
			flowAction: 'navigate',
			flowOptions: {
				flowToken: 'tok-1',
				screen: 'WELCOME',
				flowActionPayload: '{"orderId":"1234"}',
			},
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action, {
		name: 'flow',
		parameters: {
			flow_message_version: '3',
			flow_id: '1234567890',
			flow_cta: 'Book now',
			flow_action: 'navigate',
			flow_token: 'tok-1',
			flow_action_payload: { screen: 'WELCOME', data: { orderId: '1234' } },
		},
	});
});

test('interactive: flow omits token and payload when the options are left empty', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'flow',
			interactiveBody: 'Book',
			flowId: '99',
			flowCta: 'Go',
			flowAction: 'data_exchange',
			flowOptions: {},
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action.parameters, {
		flow_message_version: '3',
		flow_id: '99',
		flow_cta: 'Go',
		flow_action: 'data_exchange',
	});
});

test('interactive: location request needs only a body', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'locationRequest',
			interactiveBody: 'Where should we deliver?',
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive, {
		body: { text: 'Where should we deliver?' },
		type: 'location_request_message',
		action: { name: 'send_location' },
	});
});

test('interactive: address message carries the country parameter', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'address',
			interactiveBody: 'Confirm your address',
			addressCountry: 'IN',
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive, {
		body: { text: 'Confirm your address' },
		type: 'address_message',
		action: { name: 'address_message', parameters: { country: 'IN' } },
	});
});

test('interactive: single product sends catalog and retailer IDs', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'product',
			interactiveBody: 'Back in stock',
			catalogId: 'cat-1',
			productRetailerId: 'SKU-1234',
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive, {
		body: { text: 'Back in stock' },
		type: 'product',
		action: { catalog_id: 'cat-1', product_retailer_id: 'SKU-1234' },
	});
});

test('interactive: product list groups product items into sections', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'productList',
			headerType: 'text',
			headerText: 'This week',
			interactiveBody: 'Our picks',
			catalogId: 'cat-1',
			productItems: {
				product: [
					{ sectionTitle: 'Best sellers', productRetailerId: 'SKU-1' },
					{ sectionTitle: 'New in', productRetailerId: 'SKU-2' },
					{ sectionTitle: 'Best sellers', productRetailerId: 'SKU-3' },
				],
			},
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action, {
		catalog_id: 'cat-1',
		sections: [
			{
				title: 'Best sellers',
				product_items: [{ product_retailer_id: 'SKU-1' }, { product_retailer_id: 'SKU-3' }],
			},
			{ title: 'New in', product_items: [{ product_retailer_id: 'SKU-2' }] },
		],
	});
});

test('interactive: a document header carries link and filename', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'button',
			headerType: 'document',
			headerMediaUrl: 'https://example.com/invoice.pdf',
			headerFilename: 'invoice.pdf',
			interactiveBody: 'Your invoice',
			buttons: { button: [{ title: 'Pay' }] },
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.header, {
		type: 'document',
		document: { link: 'https://example.com/invoice.pdf', filename: 'invoice.pdf' },
	});
});

test('interactive: more than three buttons fails before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'button',
				interactiveBody: 'Pick one',
				buttons: { button: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }] },
			}),
		}),
		/more than WhatsApp allows/i,
	);
});

test('interactive: an empty list fails before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'list',
				interactiveBody: 'Choose',
				listButton: 'Open',
				listRows: {},
			}),
		}),
		/Rows is empty/i,
	);
});

test('interactive: a malformed Flow payload fails before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'flow',
				interactiveBody: 'Book',
				flowId: '99',
				flowCta: 'Go',
				flowAction: 'navigate',
				flowOptions: { flowActionPayload: 'not json' },
			}),
		}),
		/not a JSON object/i,
	);
});

/* ── contacts ─────────────────────────────────────────────────────────────── */

test('contact: upsert splits tags and parses attributes', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: {
				displayName: 'Sam',
				tags: 'vip, newsletter ,, trial',
				attributes: '{"plan":"pro"}',
			},
		},
	});

	assert.strictEqual(received[0].path, '/v1/contacts');
	assert.deepStrictEqual(received[0].body, {
		displayName: 'Sam',
		tags: ['vip', 'newsletter', 'trial'],
		attributes: { plan: 'pro' },
		phoneE164: '+919876543210',
	});
});

test('contact: getAll passes filters as query params and unwraps the list', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'getAll',
			limit: 25,
			filters: { q: 'sam', tag: 'vip' },
		},
		handler: () => ({ json: { ok: true, contacts: [{ id: 'c1' }, { id: 'c2' }] } }),
	});

	assert.strictEqual(received[0].method, 'GET');
	assert.deepStrictEqual(received[0].query, { limit: '25', q: 'sam', tag: 'vip' });
	assert.deepStrictEqual(rows.map((r) => r.json.id), ['c1', 'c2']);
});

test('contact: get unwraps the single contact envelope', async () => {
	const { rows } = await run({
		params: { ...base, resource: 'contact', operation: 'get', contactId: 'c1' },
		handler: () => ({ json: { ok: true, contact: { id: 'c1', displayName: 'Sam' } } }),
	});

	assert.deepStrictEqual(rows[0].json, { id: 'c1', displayName: 'Sam' });
});

test('contact: update with no fields fails before any request', async () => {
	await assert.rejects(
		run({
			params: { ...base, resource: 'contact', operation: 'update', contactId: 'c1', updateFields: {} },
		}),
		/at least one field/i,
	);
});

test('contact: delete uses DELETE on the id path', async () => {
	const { received } = await run({
		params: { ...base, resource: 'contact', operation: 'delete', contactId: 'c1' },
	});

	assert.strictEqual(received[0].method, 'DELETE');
	assert.strictEqual(received[0].path, '/v1/contacts/c1');
});

/* ── notes ────────────────────────────────────────────────────────────────── */

test('note: add posts to the conversation comments path with mentions', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'comment',
			operation: 'add',
			contact: '+919876543210',
			body: 'Called, will call back',
			options: { mentions: 'u1,u2', mediaIds: '', refMessageId: 'm9' },
		},
		handler: () => ({ json: { ok: true, comment: { id: 'n1' } } }),
	});

	assert.strictEqual(received[0].method, 'POST');
	// The contact key is URL-encoded so a leading + survives the path.
	assert.strictEqual(received[0].path, '/v1/conversations/%2B919876543210/comments');
	assert.deepStrictEqual(received[0].body, {
		body: 'Called, will call back',
		mentions: ['u1', 'u2'],
		refMessageId: 'm9',
	});
	assert.deepStrictEqual(rows[0].json, { id: 'n1' });
});

test('note: getAll passes the delta cursor', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'comment',
			operation: 'getAll',
			contact: 'c1',
			limit: 100,
			filters: { after: '2026-07-01T00:00:00.000Z' },
		},
		handler: () => ({ json: { ok: true, comments: [{ id: 'n1' }] } }),
	});

	assert.deepStrictEqual(received[0].query, { limit: '100', after: '2026-07-01T00:00:00.000Z' });
	assert.strictEqual(rows.length, 1);
});

/* ── templates and broadcasts ─────────────────────────────────────────────── */

test('template: create sends the parsed components array', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'template',
			operation: 'create',
			name: 'order_update',
			language: 'en',
			category: 'UTILITY',
			components: '[{"type":"BODY","text":"Hi"}]',
			options: { parameterFormat: 'NAMED' },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		name: 'order_update',
		language: 'en',
		category: 'UTILITY',
		components: [{ type: 'BODY', text: 'Hi' }],
		parameterFormat: 'NAMED',
	});
});

test('broadcast: create splits contact ids', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'broadcast',
			operation: 'create',
			name: 'July promo',
			templateId: 't1',
			variables: '{"1":"Sam"}',
			recipients: { contactIds: 'c1, c2', groupId: 'g1' },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		name: 'July promo',
		templateId: 't1',
		variables: { 1: 'Sam' },
		groupId: 'g1',
		contactIds: ['c1', 'c2'],
	});
});

test('broadcast: create with no recipients fails before any request', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'broadcast',
				operation: 'create',
				name: 'July promo',
				templateId: 't1',
				variables: '{}',
				recipients: {},
			},
		}),
		/group ID, a list of contact IDs, or both/i,
	);
});

/* ── media ────────────────────────────────────────────────────────────────── */

test('media: binary upload sends multipart with the file bytes', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'media',
			operation: 'upload',
			source: 'binary',
			binaryPropertyName: 'data',
			options: { kind: 'document' },
		},
		binary: {
			meta: { mimeType: 'application/pdf', fileName: 'brochure.pdf' },
			buffer: Buffer.from('%PDF-1.7 hello'),
		},
		handler: () => ({ status: 201, json: { ok: true, media: { id: 'm1', kind: 'document' } } }),
	});

	const req = received[0];
	assert.strictEqual(req.path, '/v1/media/upload');
	assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
	const raw = req.raw.toString();
	assert.match(raw, /name="file"; filename="brochure\.pdf"/);
	assert.match(raw, /%PDF-1\.7 hello/);
	assert.match(raw, /name="kind"[\s\S]*document/);
	assert.deepStrictEqual(rows[0].json, { id: 'm1', kind: 'document' });
});

test('media: url upload sends JSON and unwraps the media envelope', async () => {
	const { received, rows } = await run({
		params: {
			...base,
			resource: 'media',
			operation: 'upload',
			source: 'url',
			externalUrl: 'https://example.com/a.jpg',
			options: { kind: 'image', filename: 'a.jpg' },
		},
		handler: () => ({ status: 201, json: { ok: true, media: { id: 'm2' } } }),
	});

	assert.deepStrictEqual(received[0].body, {
		externalUrl: 'https://example.com/a.jpg',
		kind: 'image',
		filename: 'a.jpg',
	});
	assert.deepStrictEqual(rows[0].json, { id: 'm2' });
});

/* ── errors ───────────────────────────────────────────────────────────────── */

test("a WA.cr error envelope becomes the node error's message", async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'message',
				operation: 'send',
				channel: 'whatsapp',
				to: '+919876543210',
				messageType: 'text',
				text: 'Hello',
				options: {},
			},
			handler: () => ({
				status: 403,
				json: {
					ok: false,
					status: 403,
					error: { code: 'insufficient_scope', message: "This credential lacks the 'messages:send' scope." },
				},
			}),
		}),
		(error) => {
			assert.match(error.message, /messages:send/);
			return true;
		},
	);
});

test('continueOnFail routes the error to the output instead of throwing', async () => {
	const { server, received, port } = await startServer(() => ({
		status: 422,
		json: { ok: false, status: 422, error: { code: 'invalid_body', message: 'to is required' } },
	}));
	try {
		const ctx = makeContext({
			port,
			params: {
				...base,
				resource: 'message',
				operation: 'send',
				channel: 'whatsapp',
				to: 'nope',
				messageType: 'text',
				text: 'Hello',
				options: {},
			},
		});
		ctx.continueOnFail = () => true;
		const output = await new Wacr().execute.call(ctx);
		assert.strictEqual(received.length, 1);
		assert.match(output[0][0].json.error, /to is required/);
	} finally {
		server.close();
	}
});

test('every input item produces its own request and paired output row', async () => {
	const { received, rows } = await run({
		items: [{ json: {} }, { json: {} }, { json: {} }],
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'text',
			text: 'Hello',
			options: {},
		},
	});

	assert.strictEqual(received.length, 3);
	assert.deepStrictEqual(rows.map((r) => r.pairedItem.item), [0, 1, 2]);
});

/* ── trigger ──────────────────────────────────────────────────────────────── */

/**
 * The trigger never makes an outbound request, so it needs a different harness:
 * a fake IWebhookFunctions plus a recording stand-in for the Express response.
 */
function triggerContext({ params, headers = {}, body = {} }) {
	const sent = {};
	return {
		sent,
		ctx: {
			getNodeParameter(name, fallback) {
				if (name in params) return params[name];
				if (fallback !== undefined) return fallback;
				throw new Error(`test did not set parameter '${name}'`);
			},
			getHeaderData: () => headers,
			getBodyData: () => body,
			getResponseObject: () => ({
				status(code) {
					sent.status = code;
					return this;
				},
				json(payload) {
					sent.body = payload;
					return this;
				},
			}),
			helpers: { returnJsonArray: (rows) => rows.map((json) => ({ json })) },
		},
	};
}

/** A representative Auto Flow webhook payload, matching the documented shape. */
const flowEvent = {
	event: 'auto_flow.node',
	firedAt: '2026-07-29T10:00:00.000Z',
	test: false,
	tenantId: 't-1',
	flow: { automationId: 'a-1', versionId: 'v-1', nodeId: 'n-1' },
	enrolmentId: 'e-1',
	contact: { id: 'c-1', name: 'Sam', identities: { e164: '+919876543210' }, tags: [] },
	variables: { orderId: '1234' },
};

test('trigger: a matching secret emits the payload as one item', async () => {
	const { ctx } = triggerContext({
		params: { authHeaderName: 'X-WACR-Secret', secret: 's3cret', options: {} },
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result.workflowData, [[{ json: flowEvent }]]);
});

test('trigger: a wrong secret returns 401 and does not run the workflow', async () => {
	const { ctx, sent } = triggerContext({
		params: { authHeaderName: 'x-wacr-secret', secret: 's3cret', options: {} },
		headers: { 'x-wacr-secret': 'wrong' },
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(sent.status, 401);
	assert.deepStrictEqual(sent.body, { ok: false, error: 'invalid_secret' });
	assert.strictEqual(result.noWebhookResponse, true);
	assert.strictEqual(result.workflowData, undefined);
});

test('trigger: a missing secret header is rejected, not treated as empty-equals-empty', async () => {
	const { ctx, sent } = triggerContext({
		params: { authHeaderName: 'x-wacr-secret', secret: 's3cret', options: {} },
		headers: {},
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(sent.status, 401);
	assert.strictEqual(result.workflowData, undefined);
});

test('trigger: Ignore Test Events acknowledges a test event without running', async () => {
	const { ctx, sent } = triggerContext({
		params: {
			authHeaderName: 'x-wacr-secret',
			secret: 's3cret',
			options: { ignoreTestEvents: true },
		},
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, test: true },
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(result.workflowData, undefined);
	assert.strictEqual(sent.status, undefined); // acknowledged 200, not rejected
});

test('trigger: the Automation ID filter drops events from other flows', async () => {
	const params = {
		authHeaderName: 'x-wacr-secret',
		secret: 's3cret',
		options: { automationId: 'a-1' },
	};

	const other = triggerContext({
		params,
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, flow: { ...flowEvent.flow, automationId: 'a-2' } },
	});
	assert.strictEqual((await new WacrTrigger().webhook.call(other.ctx)).workflowData, undefined);

	const match = triggerContext({
		params,
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});
	assert.ok((await new WacrTrigger().webhook.call(match.ctx)).workflowData);
});

/* ── template variables ───────────────────────────────────────────────────── */

const { extractTemplateFields } = require('../dist/nodes/Wacr/templateVariables.js');

/** A template exercising every slot kind Meta supports. */
const richTemplate = [
	{ type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
	{ type: 'BODY', text: 'Order {{1}} ships on {{2}}' },
	{ type: 'FOOTER', text: 'No variables here' },
	{
		type: 'BUTTONS',
		buttons: [
			{ type: 'QUICK_REPLY', text: 'Ignore me' },
			{ type: 'URL', text: 'Track', url: 'https://example.com/{{1}}' },
		],
	},
];

test('template fields: every placeholder becomes one mappable slot', () => {
	assert.deepStrictEqual(
		extractTemplateFields(richTemplate).map((f) => f.id),
		['header_1', 'body_1', 'body_2', 'button_1_1'],
	);
});

test('template fields: a media header takes a URL, and encodes its format in the ID', () => {
	assert.deepStrictEqual(
		extractTemplateFields([{ type: 'HEADER', format: 'IMAGE' }]).map((f) => f.id),
		['header_media_image'],
	);
});

test('template fields: a template with no variables yields no slots', () => {
	assert.deepStrictEqual(extractTemplateFields([{ type: 'BODY', text: 'Static text' }]), []);
});

test('template send: mapped variables become an ordered components array', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'template',
			templateName: 'order_update',
			languageCode: 'en',
			variableInput: 'mapped',
			templateVariables: {
				mappingMode: 'defineBelow',
				value: {
					body_2: 'Friday',
					body_1: '1234',
					header_1: 'Sam',
					button_1_1: 'track/1234',
				},
			},
			options: {},
		},
	});

	assert.deepStrictEqual(received[0].body.components, [
		{ type: 'header', parameters: [{ type: 'text', text: 'Sam' }] },
		{
			type: 'body',
			parameters: [
				{ type: 'text', text: '1234' },
				{ type: 'text', text: 'Friday' },
			],
		},
		{
			type: 'button',
			sub_type: 'url',
			index: '1',
			parameters: [{ type: 'text', text: 'track/1234' }],
		},
	]);
});

test('template send: a media header becomes a link parameter of the right type', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'template',
			templateName: 'promo',
			languageCode: 'en',
			variableInput: 'mapped',
			templateVariables: {
				value: { header_media_image: 'https://example.com/banner.jpg' },
			},
			options: {},
		},
	});

	assert.deepStrictEqual(received[0].body.components, [
		{
			type: 'header',
			parameters: [{ type: 'image', image: { link: 'https://example.com/banner.jpg' } }],
		},
	]);
});

test('template send: an unmapped template omits components entirely', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'template',
			templateName: 'static',
			languageCode: 'en',
			variableInput: 'mapped',
			templateVariables: { value: {} },
			options: {},
		},
	});

	assert.ok(!('components' in received[0].body));
});
