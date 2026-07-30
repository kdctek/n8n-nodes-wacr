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

const field = (id: string, displayName: string): TemplateField => ({
	id,
	displayName,
	required: true,
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
			asArray(component.buttons).forEach((button, index) => {
				if (String(button.type ?? '').toUpperCase() !== 'URL') return;
				for (const p of placeholders(String(button.url ?? ''))) {
					const label = button.text ? `${String(button.text)} URL` : `Button ${index + 1} URL`;
					fields.push(field(`button_${index}_${p.key}`, label));
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
	const buttons = new Map<string, Record<string, string>>();
	let headerMedia: string | undefined;
	let headerMediaType: string | undefined;

	for (const [id, raw] of Object.entries(values)) {
		if (raw === undefined || raw === null || raw === '') continue;
		const v = String(raw);

		if (id === 'header_media') {
			headerMedia = v;
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
			const [index, ...rest] = id.slice('button_'.length).split('_');
			if (!rest.length) continue;
			const slot = buttons.get(index) ?? {};
			slot[rest.join('_')] = v;
			buttons.set(index, slot);
		}
	}

	const textParams = (slots: Record<string, string>) =>
		Object.keys(slots)
			.sort(bySlot)
			.map((k) => ({ type: 'text', text: slots[k] }));

	const out: IDataObject[] = [];

	if (headerMedia) {
		const media = (headerMediaType ?? 'image').toLowerCase();
		out.push({ type: 'header', parameters: [{ type: media, [media]: { link: headerMedia } }] });
	} else if (Object.keys(header).length) {
		out.push({ type: 'header', parameters: textParams(header) });
	}

	if (Object.keys(body).length) out.push({ type: 'body', parameters: textParams(body) });

	const ordered = [...buttons.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
	for (const [index, slots] of ordered) {
		out.push({
			type: 'button',
			sub_type: 'url',
			// Meta indexes buttons as a string, by position in the template.
			index: String(index),
			parameters: textParams(slots),
		});
	}

	return out;
}
