import type { IDataObject } from 'n8n-workflow';

/**
 * Turns an approved template's `components` into the variable slots it actually
 * declares, and back into the Cloud API `components` array a send needs.
 *
 * `GET /v1/templates` returns each template's components, so the node can offer
 * exactly the right fields instead of asking for hand-written JSON.
 *
 * Both functions here are pure — they are the part worth unit-testing. The
 * resourceMapper UI that consumes them cannot be exercised without a running
 * n8n.
 */

/** Meta placeholders: positional `{{1}}` or named `{{order_id}}`. */
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** A mappable slot, in the shape n8n's resourceMapper expects. */
export interface TemplateField {
	id: string;
	displayName: string;
	required: boolean;
	defaultMatch: boolean;
	display: boolean;
	type: 'string';
}

interface Placeholder {
	/** `1` for `{{1}}`, or the name for `{{order_id}}`. */
	key: string;
	/** Sort key — positional placeholders keep Meta's numeric order. */
	position: number;
}

/** Placeholders in the order Meta will substitute them. */
function placeholders(text: string): Placeholder[] {
	const found = new Map<string, Placeholder>();
	let seen = 0;
	for (const match of text.matchAll(PLACEHOLDER)) {
		const key = match[1];
		if (found.has(key)) continue;
		const numeric = Number(key);
		found.set(key, {
			key,
			position: Number.isInteger(numeric) ? numeric : 1_000 + seen,
		});
		seen++;
	}
	return [...found.values()].sort((a, b) => a.position - b.position);
}

const asArray = (v: unknown): IDataObject[] => (Array.isArray(v) ? (v as IDataObject[]) : []);

/**
 * A template placeholder must be filled or Meta rejects the send, so slots
 * default to required. Location `name` and `address` are the exception — Meta
 * treats those as optional decoration on the coordinates.
 */
const field = (id: string, displayName: string, required = true): TemplateField => ({
	id,
	displayName,
	required,
	defaultMatch: false,
	display: true,
	type: 'string',
});

/** Component `type` is upper-case in Meta's payloads, but be lenient. */
const typeOf = (c: IDataObject): string => String(c.type ?? '').toUpperCase();

/**
 * The slots a template declares. IDs are stable and encode where the value
 * belongs: `header_1`, `body_2`, `button_0_1`, `header_media`.
 */
export function extractTemplateFields(components: unknown): TemplateField[] {
	const fields: TemplateField[] = [];

	for (const component of asArray(components)) {
		const kind = typeOf(component);

		if (kind === 'HEADER') {
			const format = String(component.format ?? 'TEXT').toUpperCase();
			if (format === 'TEXT') {
				for (const p of placeholders(String(component.text ?? ''))) {
					fields.push(field(`header_${p.key}`, `Header ${p.key}`));
				}
			} else if (format === 'LOCATION') {
				// A location header is four values, not a link. Meta names the label
				// `name`, not `title`.
				fields.push(field('header_location_latitude', 'Header latitude'));
				fields.push(field('header_location_longitude', 'Header longitude'));
				fields.push(field('header_location_name', 'Header location name', false));
				fields.push(field('header_location_address', 'Header address', false));
			} else {
				// Media headers take a link rather than a substitution. The format is
				// encoded in the id so a send can rebuild the parameter without
				// re-fetching the template.
				fields.push(
					field(`header_media_${format.toLowerCase()}`, `Header ${format.toLowerCase()} URL`),
				);
			}
			continue;
		}

		if (kind === 'BODY') {
			for (const p of placeholders(String(component.text ?? ''))) {
				fields.push(field(`body_${p.key}`, `Body ${p.key}`));
			}
			continue;
		}

		if (kind === 'BUTTONS') {
			// Template buttons mix types, and each takes a different send-time
			// parameter — or none. PHONE_NUMBER and a static URL need nothing, so
			// they get no slot. The sub-type is encoded in the id so the send can
			// rebuild the right parameter shape without re-fetching the template.
			asArray(component.buttons).forEach((button, index) => {
				const buttonType = String(button.type ?? '').toUpperCase();
				const label = button.text ? String(button.text) : `Button ${index + 1}`;

				if (buttonType === 'URL') {
					for (const p of placeholders(String(button.url ?? ''))) {
						fields.push(field(`button_${index}_url_${p.key}`, `${label} URL`));
					}
					return;
				}
				if (buttonType === 'QUICK_REPLY') {
					fields.push(field(`button_${index}_payload`, `${label} payload`));
					return;
				}
				if (buttonType === 'COPY_CODE') {
					fields.push(field(`button_${index}_coupon`, `${label} coupon code`));
				}
			});
		}
	}

	return fields;
}

/** Sort numeric slot keys by value; keep named ones after, in field order. */
function bySlot(a: string, b: string): number {
	const na = Number(a);
	const nb = Number(b);
	const aNum = Number.isInteger(na);
	const bNum = Number.isInteger(nb);
	if (aNum && bNum) return na - nb;
	if (aNum) return -1;
	if (bNum) return 1;
	return 0;
}

/**
 * Rebuild the Cloud API `components` array from mapped values.
 *
 * Deliberately derived from the field IDs alone — they already encode where
 * each value belongs — so a send does not have to re-fetch the template just to
 * learn its shape. Empty slots are skipped, so a partly filled mapping still
 * sends rather than erroring.
 */
export function buildComponentsFromValues(values: IDataObject): IDataObject[] {
	const header: Record<string, string> = {};
	const body: Record<string, string> = {};
	/** index → { subType, slots } — sub-type comes from the id, not the template. */
	const buttons = new Map<string, { subType: string; slots: Record<string, string> }>();
	const headerLocation: Record<string, string> = {};
	let headerMedia: string | undefined;
	let headerMediaType: string | undefined;

	for (const [id, raw] of Object.entries(values)) {
		if (raw === undefined || raw === null || raw === '') continue;
		const v = String(raw);

		if (id === 'header_media') {
			headerMedia = v;
			continue;
		}
		if (id.startsWith('header_location_')) {
			headerLocation[id.slice('header_location_'.length)] = v;
			continue;
		}
		if (id.startsWith('header_media_')) {
			headerMedia = v;
			headerMediaType = id.slice('header_media_'.length);
			continue;
		}
		if (id.startsWith('header_')) {
			header[id.slice('header_'.length)] = v;
			continue;
		}
		if (id.startsWith('body_')) {
			body[id.slice('body_'.length)] = v;
			continue;
		}
		if (id.startsWith('button_')) {
			const [index, kind, ...rest] = id.slice('button_'.length).split('_');
			if (!kind) continue;

			const entry = buttons.get(index) ?? { subType: '', slots: {} };
			if (kind === 'payload') {
				entry.subType = 'quick_reply';
				entry.slots.payload = v;
			} else if (kind === 'coupon') {
				entry.subType = 'copy_code';
				entry.slots.coupon = v;
			} else if (kind === 'url') {
				if (!rest.length) continue;
				entry.subType = 'url';
				entry.slots[rest.join('_')] = v;
			} else {
				continue;
			}
			buttons.set(index, entry);
		}
	}

	const textParams = (slots: Record<string, string>) =>
		Object.keys(slots)
			.sort(bySlot)
			.map((k) => ({ type: 'text', text: slots[k] }));

	const out: IDataObject[] = [];

	if (headerLocation.latitude && headerLocation.longitude) {
		// Meta wants numbers for the coordinates; anything non-numeric passes
		// through so an expression returning a string still reaches the API.
		const coord = (v: string): number | string => (Number.isFinite(Number(v)) ? Number(v) : v);
		const location: IDataObject = {
			latitude: coord(headerLocation.latitude),
			longitude: coord(headerLocation.longitude),
		};
		if (headerLocation.name) location.name = headerLocation.name;
		if (headerLocation.address) location.address = headerLocation.address;
		out.push({ type: 'header', parameters: [{ type: 'location', location }] });
	} else if (headerMedia) {
		const media = (headerMediaType ?? 'image').toLowerCase();
		out.push({ type: 'header', parameters: [{ type: media, [media]: { link: headerMedia } }] });
	} else if (Object.keys(header).length) {
		out.push({ type: 'header', parameters: textParams(header) });
	}

	if (Object.keys(body).length) out.push({ type: 'body', parameters: textParams(body) });

	const ordered = [...buttons.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
	for (const [index, { subType, slots }] of ordered) {
		let parameters: IDataObject[];
		if (subType === 'quick_reply') {
			parameters = [{ type: 'payload', payload: slots.payload }];
		} else if (subType === 'copy_code') {
			parameters = [{ type: 'coupon_code', coupon_code: slots.coupon }];
		} else {
			parameters = textParams(slots);
		}
		out.push({
			type: 'button',
			sub_type: subType || 'url',
			// Meta indexes buttons as a string, by position in the template.
			index: String(index),
			parameters,
		});
	}

	return out;
}
