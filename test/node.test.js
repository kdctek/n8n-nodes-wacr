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
		getNodeParameter(name, _i, fallback, options) {
			let value;
			if (name in params) value = params[name];
			else if (fallback !== undefined) value = fallback;
			else throw new Error(`test did not set parameter '${name}'`);

			// Mirror n8n: a resourceLocator parameter read with extractValue gets
			// unwrapped to whichever mode's value the user chose. Tests may pass
			// either the locator object or a bare string.
			if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
				return value.value;
			}
			return value;
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

test('message: contact details ride along with the send', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'text',
			text: 'Hello',
			options: {},
			contactDetails: {
				firstName: ' Asha ',
				lastName: 'Menon',
				displayName: 'Asha M. (VIP)',
				email: 'asha@example.com',
				override: true,
			},
		},
	});

	assert.deepStrictEqual(received[0].body, {
		channel: 'whatsapp',
		to: '+919876543210',
		firstName: 'Asha',
		lastName: 'Menon',
		displayName: 'Asha M. (VIP)',
		email: 'asha@example.com',
		override: true,
		text: 'Hello',
	});
});

test('message: blank contact details are dropped, and override alone is not sent', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'text',
			text: 'Hello',
			options: {},
			// Whitespace is "not provided", and `override` only widens what an
			// accompanying detail may replace — on its own it means nothing.
			contactDetails: { firstName: '   ', displayName: '', override: true },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		channel: 'whatsapp',
		to: '+919876543210',
		text: 'Hello',
	});
});

test('message: contact details apply on the email channel too', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'email',
			to: 'sam@example.com',
			subject: 'Your order',
			html: '<p>Shipped</p>',
			contactDetails: { firstName: 'Sam' },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		channel: 'email',
		to: 'sam@example.com',
		firstName: 'Sam',
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

test('interactive: nested sections keep their own rows, in order', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'list',
			interactiveBody: 'Pick a delivery slot',
			listButton: 'View slots',
			listSections: {
				section: [
					{
						title: 'Morning',
						rows: {
							row: [
								{ title: '9am to 11am', description: 'Fastest' },
								{ title: '11am to 1pm' },
							],
						},
					},
					{ title: 'Evening', rows: { row: [{ title: '5pm to 7pm', id: 'eve' }] } },
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

test('interactive: an untitled section omits the title key entirely', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'list',
			interactiveBody: 'Choose',
			listButton: 'Open',
			listSections: { section: [{ rows: { row: [{ title: 'Only option' }] } }] },
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action.sections, [
		{ rows: [{ id: 'only_option', title: 'Only option' }] },
	]);
});

test('interactive: a section with no rows is dropped rather than sent empty', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'list',
			interactiveBody: 'Choose',
			listButton: 'Open',
			listSections: {
				section: [
					{ title: 'Empty', rows: {} },
					{ title: 'Real', rows: { row: [{ title: 'Pick me' }] } },
				],
			},
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.action.sections, [
		{ title: 'Real', rows: [{ id: 'pick_me', title: 'Pick me' }] },
	]);
});

test('interactive: a list with no rows at all fails before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'list',
				interactiveBody: 'Choose',
				listButton: 'Open',
				listSections: { section: [{ title: 'Empty', rows: {} }] },
			}),
		}),
		/Sections has no rows/i,
	);
});

test('interactive: the 10-row cap is cumulative across sections, not per section', async () => {
	// Six rows in each of two sections: legal per section, illegal in total.
	const rows = (n, prefix) => ({ row: Array.from({ length: n }, (_, k) => ({ title: `${prefix}${k}` })) });
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'list',
				interactiveBody: 'Choose',
				listButton: 'Open',
				listSections: {
					section: [
						{ title: 'A', rows: rows(6, 'a') },
						{ title: 'B', rows: rows(6, 'b') },
					],
				},
			}),
		}),
		/12 rows in total, which is more than WhatsApp allows/i,
	);
});

test('interactive: more than ten sections fails before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'list',
				interactiveBody: 'Choose',
				listButton: 'Open',
				listSections: {
					section: Array.from({ length: 11 }, (_, k) => ({
						title: `S${k}`,
						rows: { row: [{ title: `r${k}` }] },
					})),
				},
			}),
		}),
		/11 entries, which is more than WhatsApp allows/i,
	);
});

test('interactive: a location header uses Meta names — latitude, longitude, name, address', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'button',
			headerType: 'location',
			headerLatitude: '19.076',
			headerLongitude: '72.8777',
			headerLocationName: 'Gateway of India',
			headerLocationAddress: 'Apollo Bandar, Colaba, Mumbai',
			interactiveBody: 'Collect from here?',
			buttons: { button: [{ title: 'Yes' }] },
		}),
	});

	assert.deepStrictEqual(received[0].body.message.interactive.header, {
		type: 'location',
		location: {
			latitude: 19.076,
			longitude: 72.8777,
			name: 'Gateway of India',
			address: 'Apollo Bandar, Colaba, Mumbai',
		},
	});
});

test('interactive: a location header without coordinates is omitted, not half-sent', async () => {
	const { received } = await run({
		params: interactive({
			interactiveType: 'button',
			headerType: 'location',
			headerLatitude: '',
			headerLongitude: '',
			headerLocationName: 'Nowhere',
			interactiveBody: 'Body',
			buttons: { button: [{ title: 'Ok' }] },
		}),
	});

	assert.ok(!('header' in received[0].body.message.interactive));
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

test('contact: upsert carries first and last name', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: { firstName: 'Asha', lastName: 'Menon' },
		},
	});

	assert.deepStrictEqual(received[0].body, {
		firstName: 'Asha',
		lastName: 'Menon',
		phoneE164: '+919876543210',
	});
});

test('contact: update sends only the name fields that were filled in', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'update',
			contactId: 'c1',
			updateFields: { firstName: 'Asha', lastName: '', displayName: 'Asha M. (VIP)' },
		},
	});

	assert.strictEqual(received[0].method, 'PATCH');
	assert.deepStrictEqual(received[0].body, { firstName: 'Asha', displayName: 'Asha M. (VIP)' });
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

test('contact: create or update on the PATCH method updates by ID', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			method: 'PATCH',
			contactId: 'c1',
			updateFields: { attributes: '{"visit":"Requested"}' },
		},
	});

	assert.strictEqual(received.length, 1);
	assert.strictEqual(received[0].method, 'PATCH');
	assert.strictEqual(received[0].path, '/v1/contacts/c1');
	assert.deepStrictEqual(received[0].body, { attributes: { visit: 'Requested' } });
});

test('contact: an empty phone number fails before any request', async () => {
	await assert.rejects(
		run({
			params: { ...base, resource: 'contact', operation: 'upsert', phoneE164: '', fields: {} },
		}),
		/Phone Number is empty/i,
	);
});

test('contact: a phone number that is not E.164 fails before any request', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'contact',
				operation: 'upsert',
				phoneE164: '9876543210',
				fields: {},
			},
		}),
		/not an E\.164 phone number/i,
	);
});

test('contact: source rides along on create', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: { source: 'shopify' },
		},
	});

	assert.deepStrictEqual(received[0].body, { source: 'shopify', phoneE164: '+919876543210' });
});

test('contact: addresses drop blank fields and send coordinates as numbers', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: {},
			addresses: {
				address: [
					{
						label: 'Home',
						purpose: 'shipping',
						name: '',
						mobile: '  ',
						addressLine1: 'Flat 4B',
						city: 'Mumbai',
						pincode: '400050',
						country: 'IN',
						latitude: '19.0607',
						longitude: '72.8362',
						digipin: '',
						instruction: '',
					},
				],
			},
		},
	});

	assert.deepStrictEqual(received[0].body.addresses, [
		{
			label: 'Home',
			purpose: 'shipping',
			addressLine1: 'Flat 4B',
			city: 'Mumbai',
			pincode: '400050',
			country: 'IN',
			latitude: 19.0607,
			longitude: 72.8362,
		},
	]);
});

test('contact: addresses ride along on an update too', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'update',
			contactId: 'c1',
			updateFields: {},
			addresses: { address: [{ label: 'Warehouse 2', city: 'Pune' }] },
		},
	});

	assert.strictEqual(received[0].method, 'PATCH');
	assert.deepStrictEqual(received[0].body, {
		addresses: [{ city: 'Pune', label: 'Warehouse 2' }],
	});
});

test('contact: a lone coordinate fails before any request', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'contact',
				operation: 'upsert',
				phoneE164: '+919876543210',
				fields: {},
				addresses: { address: [{ city: 'Mumbai', latitude: '19.0607' }] },
			},
		}),
		/both a latitude and a longitude/i,
	);
});

test('contact: an address that says who but not where fails before any request', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'contact',
				operation: 'upsert',
				phoneE164: '+919876543210',
				fields: {},
				addresses: { address: [{ name: 'Asha Menon', mobile: '+919876543210' }] },
			},
		}),
		/who but not where/i,
	);
});

test('contact: merge folds the new attributes over the stored ones', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'update',
			contactId: 'c1',
			updateFields: { attributes: '{"visit":"Completed"}', attributesMode: 'merge' },
		},
		handler: (entry) =>
			entry.method === 'GET'
				? {
						json: {
							ok: true,
							contact: {
								id: 'c1',
								attributes: { role: 'Designer', visit: 'Requested', sources: [{ source: 'wa_chat' }] },
							},
						},
					}
				: { json: { ok: true, id: 'c1' } },
	});

	assert.deepStrictEqual(
		received.map((entry) => `${entry.method} ${entry.path}`),
		['GET /v1/contacts/c1', 'PATCH /v1/contacts/c1'],
	);
	// The stored keys survive, the supplied one wins, and provenance rides back.
	assert.deepStrictEqual(received[1].body.attributes, {
		role: 'Designer',
		visit: 'Completed',
		sources: [{ source: 'wa_chat' }],
	});
});

test('contact: replace mode sends only what was given, with no lookup', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'update',
			contactId: 'c1',
			updateFields: { attributes: '{"visit":"Completed"}', attributesMode: 'replace' },
		},
	});

	assert.strictEqual(received.length, 1);
	assert.deepStrictEqual(received[0].body, { attributes: { visit: 'Completed' } });
});

test('contact: merge on create looks the contact up by phone first', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: { attributes: '{"visit":"Completed"}', attributesMode: 'merge' },
		},
		handler: (entry) =>
			entry.method === 'GET'
				? {
						json: {
							ok: true,
							contacts: [
								{ id: 'c1', phoneE164: '+919876543210', attributes: { role: 'Designer' } },
							],
						},
					}
				: { json: { ok: true, id: 'c1' } },
	});

	assert.strictEqual(received[0].method, 'GET');
	assert.deepStrictEqual(received[0].query, { q: '+919876543210', limit: '500' });
	assert.deepStrictEqual(received[1].body.attributes, { role: 'Designer', visit: 'Completed' });
});

test('contact: merge on create sends the attributes as-is for a new number', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'upsert',
			phoneE164: '+919876543210',
			fields: { attributes: '{"visit":"Requested"}', attributesMode: 'merge' },
		},
		handler: (entry) =>
			entry.method === 'GET' ? { json: { ok: true, contacts: [] } } : { json: { ok: true, id: 'c1' } },
	});

	assert.deepStrictEqual(received[1].body.attributes, { visit: 'Requested' });
});

test('contact: merge on create refuses to guess between two matches', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'contact',
				operation: 'upsert',
				phoneE164: '+919876543210',
				fields: { attributes: '{"visit":"Requested"}', attributesMode: 'merge' },
			},
			handler: () => ({
				json: { ok: true, contacts: [{ id: 'c1', phoneE164: '+91987*****10' }, { id: 'c2' }] },
			}),
		}),
		/More than one contact matched/i,
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

test('comment: By Email resolves the contact before posting', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'comment',
			operation: 'add',
			contact: { __rl: true, mode: 'email', value: 'Asha@Example.com' },
			body: 'Called back',
			options: {},
		},
		handler: (entry) =>
			entry.method === 'GET'
				? {
						json: {
							ok: true,
							contacts: [
								{ id: 'c-other', email: 'other@example.com' },
								{ id: 'c-1', email: 'asha@example.com' },
							],
						},
					}
				: { json: { ok: true, comment: { id: 'n-1' } } },
	});

	assert.deepStrictEqual(received[0].query, { q: 'Asha@Example.com', limit: '500' });
	assert.strictEqual(received[1].method, 'POST');
	assert.strictEqual(received[1].path, '/v1/conversations/c-1/comments');
});

test('comment: an email nobody has fails with a message naming it', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'comment',
				operation: 'add',
				contact: { __rl: true, mode: 'email', value: 'nobody@example.com' },
				body: 'Called back',
				options: {},
			},
			handler: () => ({ json: { ok: true, contacts: [] } }),
		}),
		/No contact has the email nobody@example\.com/i,
	);
});

test('comment: By Mobile drops the leading plus, which is the URL form', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'comment',
			operation: 'add',
			contact: { __rl: true, mode: 'phone', value: ' +919876543210 ' },
			body: 'Called back',
			options: {},
		},
	});

	assert.strictEqual(received.length, 1);
	assert.strictEqual(received[0].path, '/v1/conversations/919876543210/comments');
});

test('comment: an empty contact fails before any request', async () => {
	await assert.rejects(
		run({
			params: {
				...base,
				resource: 'comment',
				operation: 'add',
				contact: { __rl: true, mode: 'id', value: '   ' },
				body: 'Called back',
				options: {},
			},
		}),
		/Contact is empty/i,
	);
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
function triggerContext({ params = {}, credentials, headers = {}, body = {} }) {
	const sent = {};
	return {
		sent,
		ctx: {
			async getCredentials(type) {
				assert.strictEqual(type, 'wacrTriggerApi');
				if (!credentials) throw new Error('Credentials not set');
				return credentials;
			},
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
		credentials: { authHeaderName: 'X-WACR-Secret', secret: 's3cret' },
		params: { options: {} },
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result.workflowData, [[{ json: flowEvent }]]);
});

test('trigger: a wrong secret returns 401 and does not run the workflow', async () => {
	const { ctx, sent } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: {} },
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
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: {} },
		headers: {},
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(sent.status, 401);
	assert.strictEqual(result.workflowData, undefined);
});

test('trigger: Ignore Test Events acknowledges a test event without running', async () => {
	const { ctx, sent } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { ignoreTestEvents: true } },
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, test: true },
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(result.workflowData, undefined);
	assert.strictEqual(sent.status, undefined); // acknowledged 200, not rejected
});

test('trigger: the Automation ID filter drops events from other flows', async () => {
	const credentials = { authHeaderName: 'x-wacr-secret', secret: 's3cret' };
	const params = { options: { automationId: 'a-1' } };

	const other = triggerContext({
		credentials,
		params,
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, flow: { ...flowEvent.flow, automationId: 'a-2' } },
	});
	assert.strictEqual((await new WacrTrigger().webhook.call(other.ctx)).workflowData, undefined);

	const match = triggerContext({
		credentials,
		params,
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});
	assert.ok((await new WacrTrigger().webhook.call(match.ctx)).workflowData);
});

test('trigger: the secret comes from the credential, not from a node parameter', async () => {
	const properties = new WacrTrigger().description.properties.map((p) => p.name);

	assert.ok(!properties.includes('secret'), 'the secret must not be a node property');
	assert.ok(!properties.includes('authHeaderName'), 'the header name must not be a node property');
	assert.deepStrictEqual(new WacrTrigger().description.credentials, [
		{ name: 'wacrTriggerApi', required: true, testedBy: 'wacrTriggerSecret' },
	]);
});

test('trigger: a blank header name in the credential falls back to the default', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: '  ', secret: 's3cret' },
		params: { options: {} },
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result.workflowData, [[{ json: flowEvent }]]);
});

test('trigger: a header name is matched case-insensitively and untrimmed', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: ' X-Custom-Auth ', secret: 's3cret' },
		params: { options: {} },
		headers: { 'x-custom-auth': 's3cret' },
		body: flowEvent,
	});

	assert.ok((await new WacrTrigger().webhook.call(ctx)).workflowData);
});

/** The credential test is local — it never reaches WA.cr. */
const credentialTest = (data) =>
	new WacrTrigger().methods.credentialTest.wacrTriggerSecret.call(
		{},
		{ id: '1', name: 'c', type: 'wacrTriggerApi', data },
	);

test('trigger: the credential test accepts a usable pair', async () => {
	const result = await credentialTest({ authHeaderName: 'x-wacr-secret', secret: 's3cret' });

	assert.strictEqual(result.status, 'OK');
	assert.match(result.message, /x-wacr-secret/);
});

test('trigger: the credential test rejects an empty secret', async () => {
	const result = await credentialTest({ authHeaderName: 'x-wacr-secret', secret: '' });

	assert.strictEqual(result.status, 'Error');
	assert.match(result.message, /Secret is empty/);
});

test('trigger: the credential test rejects an unsendable header name', async () => {
	const blank = await credentialTest({ authHeaderName: '   ', secret: 's3cret' });
	assert.strictEqual(blank.status, 'Error');
	assert.match(blank.message, /x-wacr-secret/); // names the default to fall back on

	const illegal = await credentialTest({ authHeaderName: 'x wacr secret', secret: 's3cret' });
	assert.strictEqual(illegal.status, 'Error');
	assert.match(illegal.message, /valid HTTP header name/);
});

test('trigger: the credential test rejects a secret the header would mangle', async () => {
	const padded = await credentialTest({ authHeaderName: 'x-wacr-secret', secret: ' s3cret ' });
	assert.strictEqual(padded.status, 'Error');

	const newline = await credentialTest({ authHeaderName: 'x-wacr-secret', secret: 's3\ncret' });
	assert.strictEqual(newline.status, 'Error');
});

/* ── template variables ───────────────────────────────────────────────────── */

const { extractTemplateFields } = require('../dist/nodes/Wacr/templateVariables.js');
const { getTemplateVariables } = require('../dist/nodes/Wacr/GenericFunctions.js');

/** A template exercising every slot kind Meta supports. */
const richTemplate = [
	{ type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
	{ type: 'BODY', text: 'Order {{1}} ships on {{2}}' },
	{ type: 'FOOTER', text: 'No variables here' },
	{
		type: 'BUTTONS',
		buttons: [
			{ type: 'QUICK_REPLY', text: 'Stop' },
			{ type: 'URL', text: 'Track', url: 'https://example.com/{{1}}' },
		],
	},
];

test('template fields: every placeholder becomes one mappable slot', () => {
	assert.deepStrictEqual(
		extractTemplateFields(richTemplate).map((f) => f.id),
		['header_1', 'body_1', 'body_2', 'button_0_payload', 'button_1_url_1'],
	);
});

test('template fields: each slot is labelled with the template text around it', () => {
	assert.deepStrictEqual(
		extractTemplateFields(richTemplate).map((f) => f.displayName),
		[
			'Header 1 — “Hi {{1}}”',
			'Body 1 — “Order {{1}} ships on {{2}}”',
			'Body 2 — “Order {{1}} ships on {{2}}”',
			'Stop payload',
			'Track URL — “https://example.com/{{1}}”',
		],
	);
});

test('template fields: long text is clipped at word boundaries either side', () => {
	const [first, second] = extractTemplateFields([
		{
			type: 'BODY',
			// Newlines are layout, not meaning — a label has to stay on one line.
			text: 'The active session\n{{1}} has been paused. Date Time: {{2}}, and it will resume automatically once the system is back.',
		},
	]);

	assert.strictEqual(first.displayName, 'Body 1 — “The active session {{1}} has been paused. Date…”');
	assert.strictEqual(
		second.displayName,
		'Body 2 — “…been paused. Date Time: {{2}}, and it will resume…”',
	);
});

test('template fields: a placeholder that is the whole component keeps the bare name', () => {
	// Quotes around nothing explain less than the slot name already does.
	assert.deepStrictEqual(
		extractTemplateFields([{ type: 'HEADER', format: 'TEXT', text: '{{1}}' }]).map(
			(f) => f.displayName,
		),
		['Header 1'],
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
					button_1_url_1: 'track/1234',
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

/* ── resource locators ────────────────────────────────────────────────────── */

test('locator: a contact chosen From List is unwrapped to its ID', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'get',
			contactId: { __rl: true, mode: 'list', value: 'c-uuid-1' },
		},
	});

	assert.strictEqual(received[0].path, '/v1/contacts/c-uuid-1');
});

test('locator: a contact typed By ID is unwrapped the same way', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'contact',
			operation: 'delete',
			contactId: { __rl: true, mode: 'id', value: 'c-uuid-2' },
		},
	});

	assert.strictEqual(received[0].method, 'DELETE');
	assert.strictEqual(received[0].path, '/v1/contacts/c-uuid-2');
});

test('locator: a note contact locator still URL-encodes a phone number', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'comment',
			operation: 'getAll',
			contact: { __rl: true, mode: 'id', value: '+919876543210' },
			limit: 50,
			filters: {},
		},
	});

	assert.ok(
		received[0].path.includes('%2B919876543210'),
		`expected an encoded phone in the path, got ${received[0].path}`,
	);
});

test('locator: a template send unwraps the template name', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'template',
			templateName: { __rl: true, mode: 'list', value: 'order_update' },
			languageCode: 'en',
			variableInput: 'mapped',
			templateVariables: { value: {} },
			options: {},
		},
	});

	assert.strictEqual(received[0].body.templateName, 'order_update');
});

test('template fields: a LOCATION header yields four slots, not a media link', () => {
	assert.deepStrictEqual(
		extractTemplateFields([{ type: 'HEADER', format: 'LOCATION' }]).map((f) => f.id),
		[
			'header_location_latitude',
			'header_location_longitude',
			'header_location_name',
			'header_location_address',
		],
	);
});

test('template fields: only the location coordinates are required', () => {
	const f = extractTemplateFields([{ type: 'HEADER', format: 'LOCATION' }]);
	const required = Object.fromEntries(f.map((x) => [x.id, x.required]));
	assert.deepStrictEqual(required, {
		header_location_latitude: true,
		header_location_longitude: true,
		header_location_name: false,
		header_location_address: false,
	});
});

test('template send: a location header becomes one location parameter', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			to: '+919876543210',
			messageType: 'template',
			templateName: 'store_pickup',
			languageCode: 'en',
			variableInput: 'mapped',
			templateVariables: {
				value: {
					header_location_latitude: '19.076',
					header_location_longitude: '72.8777',
					header_location_name: 'Gateway of India',
					header_location_address: 'Apollo Bandar, Colaba, Mumbai',
				},
			},
			options: {},
		},
	});

	assert.deepStrictEqual(received[0].body.components, [
		{
			type: 'header',
			parameters: [
				{
					type: 'location',
					location: {
						latitude: 19.076,
						longitude: 72.8777,
						name: 'Gateway of India',
						address: 'Apollo Bandar, Colaba, Mumbai',
					},
				},
			],
		},
	]);
});

test('template fields: each button sub-type gets the slot it needs, and only that', () => {
	const ids = extractTemplateFields([
		{
			type: 'BUTTONS',
			buttons: [
				{ type: 'QUICK_REPLY', text: 'Stop' },
				{ type: 'URL', text: 'Track', url: 'https://example.com/{{1}}' },
				{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+911234567890' },
				{ type: 'COPY_CODE', text: 'Copy' },
			],
		},
	]).map((f) => f.id);

	// PHONE_NUMBER takes no send-time parameter, so it contributes nothing.
	assert.deepStrictEqual(ids, ['button_0_payload', 'button_1_url_1', 'button_3_coupon']);
});

test('template send: mixed buttons each build their own parameter shape', async () => {
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
				value: {
					button_0_payload: 'STOP_PROMOS',
					button_1_url_1: 'orders/1234',
					button_3_coupon: 'SAVE20',
				},
			},
			options: {},
		},
	});

	assert.deepStrictEqual(received[0].body.components, [
		{ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'STOP_PROMOS' }] },
		{ type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'orders/1234' }] },
		{ type: 'button', sub_type: 'copy_code', index: '3', parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }] },
	]);
});

test('interactive: duplicate button labels fail before any request', async () => {
	await assert.rejects(
		run({
			params: interactive({
				interactiveType: 'button',
				interactiveBody: 'Pick one',
				buttons: { button: [{ title: 'Yes' }, { title: 'Yes' }] },
			}),
		}),
		/two entries labelled "Yes"/i,
	);
});

test('getTemplateVariables: unwraps the templateName resource locator', async () => {
	// Regression: templateName became a resourceLocator, and reading it without
	// extractValue silently yielded zero fields in the real n8n UI.
	const { server, received, port } = await startServer(() => ({
		json: {
			ok: true,
			templates: [
				{ id: 't1', name: 'team_invite', language: 'en', components: [{ type: 'BODY', text: 'Hi {{1}}' }] },
			],
		},
	}));
	try {
		const ctx = makeContext({
			port,
			params: {
				templateName: { __rl: true, mode: 'list', value: 'team_invite' },
				languageCode: 'en',
			},
		});
		// ILoadOptionsFunctions passes (name, fallback, options) — no item index.
		const loadCtx = {
			...ctx,
			getNodeParameter: (name, fallback, options) => ctx.getNodeParameter(name, 0, fallback, options),
		};
		const result = await getTemplateVariables.call(loadCtx);
		assert.deepStrictEqual(result.fields.map((f) => f.id), ['body_1']);
		assert.strictEqual(received[0].path, '/v1/templates');
	} finally {
		server.close();
	}
});

test('template pickers: only APPROVED rows are listed, labelled by category', async () => {
	const { searchTemplateNames, getTemplates } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, port } = await startServer(() => ({
		json: {
			ok: true,
			templates: [
				{ id: 't1', name: 'live_one', language: 'en', status: 'APPROVED', category: 'UTILITY' },
				{ id: 't2', name: 'pending_one', language: 'en', status: 'PENDING', category: 'MARKETING' },
				{ id: 't3', name: 'rejected_one', language: 'en', status: 'REJECTED', category: 'UTILITY' },
			],
		},
	}));
	try {
		const ctx = makeContext({ port, params: {} });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };

		const byName = await searchTemplateNames.call(loadCtx);
		assert.deepStrictEqual(byName.results, [{ name: 'live_one · UTILITY', value: 'live_one' }]);

		const byId = await getTemplates.call(loadCtx);
		assert.deepStrictEqual(byId, [{ name: 'live_one (en) · UTILITY', value: 't1' }]);
	} finally {
		server.close();
	}
});

/* ── sender selection (From) ──────────────────────────────────────────────── */

test('send: From is unwrapped from the locator and sent as `from`', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			from: { __rl: true, mode: 'list', value: 'chan-1' },
			to: '919876543210',
			messageType: 'text',
			text: 'hi',
			options: {},
		},
	});
	assert.strictEqual(received[0].body.from, 'chan-1');
});

test('send: an empty From omits `from` entirely, preserving default routing', async () => {
	// Omitting the field must reproduce the pre-`from` request byte for byte —
	// every already-published workflow depends on WA.cr choosing the sender.
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'whatsapp',
			from: { __rl: true, mode: 'list', value: '' },
			to: '919876543210',
			messageType: 'text',
			text: 'hi',
			options: {},
		},
	});
	assert.ok(!('from' in received[0].body), 'from must not appear when unset');
});

test('send: email never carries `from` — the API refuses it on that channel', async () => {
	const { received } = await run({
		params: {
			...base,
			resource: 'message',
			operation: 'send',
			channel: 'email',
			from: { __rl: true, mode: 'list', value: 'chan-1' },
			to: 'someone@example.com',
			subject: 'Hi',
			html: '<p>Hi</p>',
			options: {},
		},
	});
	assert.ok(!('from' in received[0].body), 'from must not leak onto the email branch');
});

test('searchChannels: asks the API for connected senders only, and labels them', async () => {
	const { searchChannels } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer(() => ({
		json: {
			ok: true,
			channels: [
				{ id: 'c1', name: 'Support', displayPhone: '+911111111111', isDefault: true, status: 'connected' },
				{ id: 'c2', name: null, verifiedName: 'KDC', displayPhone: '+912222222222', isDefault: false, status: 'connected' },
			],
		},
	}));
	try {
		const ctx = makeContext({ port, params: {} });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		const result = await searchChannels.call(loadCtx);

		assert.strictEqual(received[0].path, '/v1/channels');
		// Only `connected` senders can be named as `from`; anything else is a
		// guaranteed 422, so the filter is pushed to the API rather than done here.
		assert.strictEqual(received[0].query.status, 'connected');
		assert.deepStrictEqual(result.results, [
			{ name: 'Support (+911111111111) · Default', value: 'c1' },
			{ name: 'KDC (+912222222222)', value: 'c2' },
		]);
	} finally {
		server.close();
	}
});

test('template pickers: a chosen sender scopes templates to its WABA', async () => {
	const { searchTemplateNames } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer((entry) =>
		entry.path === '/v1/channels'
			? { json: { ok: true, channels: [{ id: 'c1', wabaId: 'waba-9', status: 'connected' }] } }
			: { json: { ok: true, templates: [{ id: 't1', name: 'only_this', language: 'en', status: 'APPROVED' }] } },
	);
	try {
		const ctx = makeContext({
			port,
			params: { from: { __rl: true, mode: 'list', value: 'c1' } },
		});
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		const result = await searchTemplateNames.call(loadCtx);

		// The channel id is resolved to the WABA that owns it, then pushed to the
		// templates endpoint as a server-side filter.
		const templates = received.find((r) => r.path === '/v1/templates');
		assert.strictEqual(templates.query.wabaId, 'waba-9');
		assert.deepStrictEqual(result.results, [{ name: 'only_this', value: 'only_this' }]);
	} finally {
		server.close();
	}
});

test('template pickers: a WABA ID given directly as From is used as the filter', async () => {
	const { searchTemplateNames } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer((entry) =>
		entry.path === '/v1/channels'
			? { json: { ok: true, channels: [{ id: 'c1', wabaId: 'waba-9', status: 'connected' }] } }
			: { json: { ok: true, templates: [] } },
	);
	try {
		// POST /v1/messages accepts a WABA id as `from` as well as a channel id,
		// so By ID mode must tolerate both.
		const ctx = makeContext({ port, params: { from: { __rl: true, mode: 'id', value: 'waba-9' } } });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		await searchTemplateNames.call(loadCtx);

		assert.strictEqual(received.find((r) => r.path === '/v1/templates').query.wabaId, 'waba-9');
	} finally {
		server.close();
	}
});

test('template pickers: no sender means no channels lookup and no filter', async () => {
	const { searchTemplateNames } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer(() => ({
		json: { ok: true, templates: [{ id: 't1', name: 'any', language: 'en', status: 'APPROVED' }] },
	}));
	try {
		const ctx = makeContext({ port, params: {} });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		await searchTemplateNames.call(loadCtx);

		// Broadcasts have no From field at all — they must not pay for a lookup.
		assert.ok(!received.some((r) => r.path === '/v1/channels'), 'must not call /v1/channels');
		assert.deepStrictEqual(received[0].query, {});
	} finally {
		server.close();
	}
});

test('template pickers: an unknown sender lists everything rather than nothing', async () => {
	const { searchTemplateNames } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer((entry) =>
		entry.path === '/v1/channels'
			? { json: { ok: true, channels: [{ id: 'c1', wabaId: 'waba-9', status: 'connected' }] } }
			: { json: { ok: true, templates: [{ id: 't1', name: 'any', language: 'en', status: 'APPROVED' }] } },
	);
	try {
		const ctx = makeContext({ port, params: { from: { __rl: true, mode: 'id', value: 'nonsense' } } });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		const result = await searchTemplateNames.call(loadCtx);

		// An empty dropdown explains nothing. Listing everything lets the send
		// itself return `unknown_sender`, which names the actual problem.
		assert.strictEqual(received.find((r) => r.path === '/v1/templates').query.wabaId, undefined);
		assert.deepStrictEqual(result.results, [{ name: 'any', value: 'any' }]);
	} finally {
		server.close();
	}
});

test('template pickers: a 403 on channels degrades to an unfiltered list', async () => {
	// Regression: `channels:read` is newer than the rest of the API, so keys
	// minted earlier 403 on /v1/channels. Caught live — before this, an older key
	// plus a typed-in From broke the template dropdown entirely.
	const { searchTemplateNames } = require('../dist/nodes/Wacr/GenericFunctions.js');
	const { server, received, port } = await startServer((entry) =>
		entry.path === '/v1/channels'
			? {
					status: 403,
					json: { ok: false, error: { code: 'insufficient_scope', message: 'missing channels:read' } },
				}
			: { json: { ok: true, templates: [{ id: 't1', name: 'any', language: 'en', status: 'APPROVED' }] } },
	);
	try {
		const ctx = makeContext({ port, params: { from: { __rl: true, mode: 'id', value: 'waba-9' } } });
		const loadCtx = { ...ctx, getNodeParameter: (n, f, o) => ctx.getNodeParameter(n, 0, f, o) };
		const result = await searchTemplateNames.call(loadCtx);

		assert.strictEqual(received.find((r) => r.path === '/v1/templates').query.wabaId, undefined);
		assert.deepStrictEqual(result.results, [{ name: 'any', value: 'any' }]);
	} finally {
		server.close();
	}
});

test('trigger: the Event filter matches the label the flow set in a variable', async () => {
	const body = { ...flowEvent, variables: { event: 'Order_Paid', orderId: '1234' } };
	const { ctx } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { event: 'appointment_booked, order_paid' } },
		headers: { 'x-wacr-secret': 's3cret' },
		body,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result.workflowData, [[{ json: body }]]);
});

test('trigger: the Event filter drops a label it was not asked for', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { event: 'order_paid' } },
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, variables: { event: 'order_cancelled' } },
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result, {});
});

test('trigger: the Event filter reads whichever variable was named', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { event: 'won', eventVariable: 'stage' } },
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, variables: { stage: 'won', event: 'ignored' } },
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.strictEqual(result.workflowData?.[0]?.length, 1);
});

test('trigger: the Node ID filter drops events from other webhook steps', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { nodeId: 'n-9' } },
		headers: { 'x-wacr-secret': 's3cret' },
		body: flowEvent,
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result, {});
});

test('trigger: Simplify flattens the event, and its own fields win a clash', async () => {
	const { ctx } = triggerContext({
		credentials: { authHeaderName: 'x-wacr-secret', secret: 's3cret' },
		params: { options: { simplify: true } },
		headers: { 'x-wacr-secret': 's3cret' },
		body: { ...flowEvent, variables: { orderId: '1234', phone: 'not the contact' } },
	});

	const result = await new WacrTrigger().webhook.call(ctx);

	assert.deepStrictEqual(result.workflowData[0][0].json, {
		orderId: '1234',
		event: 'auto_flow.node',
		firedAt: '2026-07-29T10:00:00.000Z',
		test: false,
		automationId: 'a-1',
		nodeId: 'n-1',
		enrolmentId: 'e-1',
		contactId: 'c-1',
		name: 'Sam',
		phone: '+919876543210',
		tags: [],
		attributes: {},
	});
});
