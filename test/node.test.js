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
			type: 'n8n-nodes-wacr.wacr',
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
