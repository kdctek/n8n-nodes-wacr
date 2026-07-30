import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Assembles the Cloud API `interactive` message object from the node's typed
 * fields. `POST /v1/messages` forwards `message` to Meta unchanged, so the
 * shapes below are Meta's, not WA.cr's.
 *
 * Caps are enforced here rather than left to Meta: a 400 from Graph surfaces as
 * an opaque error several layers away, and failing before the request keeps the
 * message actionable.
 */

/** Meta's limits. Exceeding any of these is rejected upstream. */
const MAX_BUTTONS = 3;
const MAX_ROWS = 10;

/** Default an option's echo-back ID from its label. */
const slug = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, '_');

/** Group rows by section title, preserving the order titles first appear. */
function groupBySection<T extends { sectionTitle?: string }>(
	rows: T[],
): Array<{ title: string; items: T[] }> {
	const order: string[] = [];
	const bucket = new Map<string, T[]>();
	for (const row of rows) {
		const title = (row.sectionTitle ?? '').trim();
		if (!bucket.has(title)) {
			bucket.set(title, []);
			order.push(title);
		}
		bucket.get(title)!.push(row);
	}
	return order.map((title) => ({ title, items: bucket.get(title)! }));
}

/** Read a `fixedCollection` with `multipleValues` into a plain array. */
function collection<T>(this: IExecuteFunctions, name: string, key: string, i: number): T[] {
	const raw = this.getNodeParameter(name, i, {}) as IDataObject;
	return (raw[key] as T[] | undefined) ?? [];
}

function buildHeader(this: IExecuteFunctions, i: number): IDataObject | undefined {
	const headerType = this.getNodeParameter('headerType', i, 'none') as string;
	if (headerType === 'none') return undefined;

	if (headerType === 'text') {
		const text = this.getNodeParameter('headerText', i, '') as string;
		return text ? { type: 'text', text } : undefined;
	}

	const link = this.getNodeParameter('headerMediaUrl', i, '') as string;
	if (!link) return undefined;

	const media: IDataObject = { link };
	if (headerType === 'document') {
		const filename = this.getNodeParameter('headerFilename', i, '') as string;
		if (filename) media.filename = filename;
	}
	return { type: headerType, [headerType]: media };
}

export function buildInteractiveMessage(this: IExecuteFunctions, i: number): IDataObject {
	const kind = this.getNodeParameter('interactiveType', i) as string;
	const interactive: IDataObject = {};

	const header = buildHeader.call(this, i);
	if (header) interactive.header = header;

	const bodyText = this.getNodeParameter('interactiveBody', i, '') as string;
	if (bodyText) interactive.body = { text: bodyText };

	const footerText = this.getNodeParameter('interactiveFooter', i, '') as string;
	if (footerText) interactive.footer = { text: footerText };

	switch (kind) {
		case 'button': {
			const buttons = collection.call(this, 'buttons', 'button', i) as Array<{
				title: string;
				id?: string;
			}>;
			if (!buttons.length) {
				throw new NodeOperationError(this.getNode(), 'Buttons is empty', {
					itemIndex: i,
					description: 'Add at least one button, or choose a different Interactive Type.',
				});
			}
			if (buttons.length > MAX_BUTTONS) {
				throw new NodeOperationError(
					this.getNode(),
					`Buttons has ${buttons.length} entries, which is more than WhatsApp allows`,
					{ itemIndex: i, description: `Remove ${buttons.length - MAX_BUTTONS} so that at most ${MAX_BUTTONS} remain.` },
				);
			}
			interactive.type = 'button';
			interactive.action = {
				buttons: buttons.map((b) => ({
					type: 'reply',
					reply: { id: b.id || slug(b.title), title: b.title },
				})),
			};
			break;
		}

		case 'list': {
			const rows = collection.call(this, 'listRows', 'row', i) as Array<{
				sectionTitle?: string;
				title: string;
				description?: string;
				id?: string;
			}>;
			if (!rows.length) {
				throw new NodeOperationError(this.getNode(), 'Rows is empty', {
					itemIndex: i,
					description: 'Add at least one row, or choose a different Interactive Type.',
				});
			}
			if (rows.length > MAX_ROWS) {
				throw new NodeOperationError(
					this.getNode(),
					`Rows has ${rows.length} entries, which is more than WhatsApp allows`,
					{ itemIndex: i, description: `Remove ${rows.length - MAX_ROWS} so that at most ${MAX_ROWS} remain.` },
				);
			}
			interactive.type = 'list';
			interactive.action = {
				button: this.getNodeParameter('listButton', i) as string,
				sections: groupBySection(rows).map((section) => {
					const rowObjects = section.items.map((r) => {
						const row: IDataObject = { id: r.id || slug(r.title), title: r.title };
						if (r.description) row.description = r.description;
						return row;
					});
					return section.title ? { title: section.title, rows: rowObjects } : { rows: rowObjects };
				}),
			};
			break;
		}

		case 'ctaUrl':
			interactive.type = 'cta_url';
			interactive.action = {
				name: 'cta_url',
				parameters: {
					display_text: this.getNodeParameter('ctaDisplayText', i) as string,
					url: this.getNodeParameter('ctaUrl', i) as string,
				},
			};
			break;

		case 'flow': {
			const opts = this.getNodeParameter('flowOptions', i, {}) as IDataObject;
			const flowAction = this.getNodeParameter('flowAction', i) as string;

			const payload: IDataObject = {};
			if (opts.screen) payload.screen = opts.screen;
			if (opts.flowActionPayload) {
				const parsed = parseFlowPayload.call(this, opts.flowActionPayload, i);
				if (Object.keys(parsed).length) payload.data = parsed;
			}

			const parameters: IDataObject = {
				flow_message_version: '3',
				flow_id: this.getNodeParameter('flowId', i) as string,
				flow_cta: this.getNodeParameter('flowCta', i) as string,
				flow_action: flowAction,
			};
			if (opts.flowToken) parameters.flow_token = opts.flowToken;
			if (Object.keys(payload).length) parameters.flow_action_payload = payload;

			interactive.type = 'flow';
			interactive.action = { name: 'flow', parameters };
			break;
		}

		case 'locationRequest':
			interactive.type = 'location_request_message';
			interactive.action = { name: 'send_location' };
			break;

		case 'address':
			interactive.type = 'address_message';
			interactive.action = {
				name: 'address_message',
				parameters: { country: this.getNodeParameter('addressCountry', i) as string },
			};
			break;

		case 'product':
			interactive.type = 'product';
			interactive.action = {
				catalog_id: this.getNodeParameter('catalogId', i) as string,
				product_retailer_id: this.getNodeParameter('productRetailerId', i) as string,
			};
			break;

		case 'productList': {
			const items = collection.call(this, 'productItems', 'product', i) as Array<{
				sectionTitle?: string;
				productRetailerId: string;
			}>;
			if (!items.length) {
				throw new NodeOperationError(this.getNode(), 'Products is empty', {
					itemIndex: i,
					description: 'Add at least one product, or choose a different Interactive Type.',
				});
			}
			interactive.type = 'product_list';
			interactive.action = {
				catalog_id: this.getNodeParameter('catalogId', i) as string,
				sections: groupBySection(items).map((section) => {
					const products = section.items.map((p) => ({
						product_retailer_id: p.productRetailerId,
					}));
					return section.title
						? { title: section.title, product_items: products }
						: { product_items: products };
				}),
			};
			break;
		}

		default:
			throw new NodeOperationError(this.getNode(), `Unknown Interactive Type: ${kind}`, {
				itemIndex: i,
			});
	}

	return { type: 'interactive', interactive };
}

/** The Flow payload arrives as either a JSON string or an already-parsed object. */
function parseFlowPayload(
	this: IExecuteFunctions,
	value: unknown,
	i: number,
): IDataObject {
	if (value && typeof value === 'object') return value as IDataObject;
	if (typeof value !== 'string' || !value.trim()) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('not an object');
		}
		return parsed as IDataObject;
	} catch {
		throw new NodeOperationError(this.getNode(), 'Flow Action Payload is not a JSON object', {
			itemIndex: i,
			description: 'Provide a JSON object such as {"orderId": "1234"}.',
		});
	}
}
