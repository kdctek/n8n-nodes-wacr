import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
	JsonObject,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { extractTemplateFields } from './templateVariables';

/**
 * Shared transport for the WA.cr `/v1` developer API.
 *
 * The workspace is NEVER passed in the URL or body — the API derives it from the
 * credential. So one n8n credential addresses exactly one WA.cr workspace; to
 * work across workspaces, add one credential each and select per node.
 */

export type WacrContext = IExecuteFunctions | ILoadOptionsFunctions;

export type WacrCredentialName = 'wacrApi' | 'wacrOAuth2Api';

const HOSTS: Record<string, string> = {
	production: 'https://api.wa.cr',
	staging: 'https://api.wacart.dev',
};

/** Resolve the API host from the credential's environment selector. */
export function resolveBaseUrl(credentials: IDataObject): string {
	const environment = (credentials.environment as string) || 'production';
	const raw =
		environment === 'custom'
			? ((credentials.customBaseUrl as string) || '').trim()
			: HOSTS[environment];
	return (raw || HOSTS.production).replace(/\/+$/, '');
}

/**
 * Which credential this node run is using.
 *
 * Safe in both contexts: `IExecuteFunctions` reads item 0, while
 * `ILoadOptionsFunctions` treats the second argument as a fallback that is never
 * reached because the `authentication` property always exists on the node.
 */
export function wacrCredentialName(ctx: WacrContext): WacrCredentialName {
	const authentication = ctx.getNodeParameter('authentication', 0) as string;
	return authentication === 'oAuth2' ? 'wacrOAuth2Api' : 'wacrApi';
}

/** WA.cr's error envelope: `{ ok: false, status, error: { code, message } }`. */
interface WacrErrorEnvelope {
	code?: string;
	message?: string;
}

function readEnvelope(candidate: unknown): WacrErrorEnvelope | null {
	if (!candidate || typeof candidate !== 'object') return null;
	const body = candidate as IDataObject;
	const nested = body.error;
	if (nested && typeof nested === 'object') {
		const { code, message } = nested as IDataObject;
		if (typeof code === 'string' || typeof message === 'string') {
			return { code: code as string | undefined, message: message as string | undefined };
		}
	}
	// The OAuth token endpoint uses the RFC 6749 shape instead.
	if (typeof nested === 'string') {
		return { code: nested, message: body.error_description as string | undefined };
	}
	return null;
}

/** Pull WA.cr's own error text out of whatever shape the HTTP helper threw. */
function describeWacrError(error: unknown): { message?: string; description?: string } {
	const err = error as IDataObject;
	const response = err?.response as IDataObject | undefined;
	const cause = err?.cause as IDataObject | undefined;
	const causeResponse = cause?.response as IDataObject | undefined;

	const candidates = [
		response?.body,
		response?.data,
		causeResponse?.body,
		causeResponse?.data,
		err,
		cause,
	];

	for (const candidate of candidates) {
		const envelope = readEnvelope(candidate);
		if (!envelope) continue;
		const message = envelope.message ?? envelope.code;
		if (!message) continue;
		return {
			message,
			description: envelope.code ? `WA.cr error code: ${envelope.code}` : undefined,
		};
	}
	return {};
}

/** Make one authenticated call to `/v1`. */
export async function wacrApiRequest(
	this: WacrContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	overrides: Partial<IHttpRequestOptions> = {},
): Promise<IDataObject> {
	const credentialName = wacrCredentialName(this);
	const credentials = await this.getCredentials(credentialName);

	const options: IHttpRequestOptions = {
		method,
		url: `${resolveBaseUrl(credentials as unknown as IDataObject)}${endpoint}`,
		headers: { Accept: 'application/json' },
		json: true,
	};
	if (Object.keys(qs).length) options.qs = qs;
	if (Object.keys(body).length) options.body = body;
	Object.assign(options, overrides);

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			credentialName,
			options,
		);
		// A multipart call runs with `json: false`, so the body comes back as text.
		if (typeof response === 'string') {
			try {
				return JSON.parse(response) as IDataObject;
			} catch {
				return { raw: response };
			}
		}
		return response as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, describeWacrError(error));
	}
}

/** Split a comma/newline separated field into trimmed, non-empty values. */
export function toList(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(/[\n,]/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/**
 * Parse a JSON-typed node parameter. n8n hands these over as an already-parsed
 * object when the field holds a literal, or as a string when it came from an
 * expression — accept both.
 */
export function parseJsonParameter(value: unknown, fieldName: string): IDataObject {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object') return value as IDataObject;
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === 'object') return parsed as IDataObject;
		} catch {
			throw new Error(`${fieldName} must be valid JSON.`);
		}
	}
	throw new Error(`${fieldName} must be a JSON object.`);
}

/** Same as `parseJsonParameter`, for fields that must be a JSON array. */
export function parseJsonArrayParameter(value: unknown, fieldName: string): IDataObject[] {
	if (value === undefined || value === null || value === '') return [];
	const parsed = typeof value === 'string' ? JSON.parse(value) : value;
	if (!Array.isArray(parsed)) throw new Error(`${fieldName} must be a JSON array.`);
	return parsed as IDataObject[];
}

/* ── load options ─────────────────────────────────────────────────────────── */

interface TemplateRow {
	id?: string;
	name?: string;
	language?: string;
	status?: string;
	components?: unknown;
}

async function listTemplates(ctx: ILoadOptionsFunctions): Promise<TemplateRow[]> {
	const response = await wacrApiRequest.call(ctx, 'GET', '/v1/templates');
	return ((response.templates as TemplateRow[] | undefined) ?? []).filter((row) => Boolean(row.name));
}

/** Template picker keyed by template UUID — what broadcasts take. */
export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const templates = await listTemplates(this);
	return templates
		.filter((row) => Boolean(row.id))
		.map((row) => ({
			name: `${row.name} (${row.language ?? '—'})${row.status ? ` · ${row.status}` : ''}`,
			value: row.id as string,
		}));
}

/** Template picker keyed by template NAME — what a send takes. */
export async function getTemplateNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const templates = await listTemplates(this);
	const seen = new Set<string>();
	const options: INodePropertyOptions[] = [];
	for (const row of templates) {
		const name = row.name as string;
		if (seen.has(name)) continue;
		seen.add(name);
		options.push({ name, value: name });
	}
	return options;
}

/**
 * Variable slots for the chosen template, for n8n's resourceMapper.
 *
 * Matches on name + language when both are set, because the same template name
 * exists once per translation and their placeholders can differ.
 */
export async function getTemplateVariables(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const name = this.getNodeParameter('templateName', '') as string;
	if (!name) return { fields: [] };

	const language = this.getNodeParameter('languageCode', '') as string;
	const templates = await listTemplates(this);
	const match =
		templates.find((row) => row.name === name && row.language === language) ??
		templates.find((row) => row.name === name);

	return { fields: extractTemplateFields(match?.components) as ResourceMapperFields['fields'] };
}

/* ── resource locator searches ────────────────────────────────────────────── */

/**
 * Label a contact for a picker. Workspaces can mask phone numbers, so the name
 * is preferred and the number only ever supplements it.
 */
function contactLabel(contact: IDataObject): string {
	const name = (contact.displayName as string | null) ?? '';
	const phone = (contact.phoneE164 as string | null) ?? '';
	if (name && phone) return `${name} (${phone})`;
	return name || phone || (contact.id as string);
}

/**
 * Contact picker. The search term goes to the API as `q` rather than being
 * filtered here, so it matches across the whole workspace and not just the
 * first page.
 */
export async function searchContacts(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = { limit: 100 };
	if (filter) qs.q = filter;

	const response = await wacrApiRequest.call(this, 'GET', '/v1/contacts', {}, qs);
	const results: INodeListSearchItems[] = ((response.contacts as IDataObject[]) ?? [])
		.filter((contact) => Boolean(contact.id))
		.map((contact) => ({ name: contactLabel(contact), value: contact.id as string }));

	return { results };
}

/** Templates keyed by UUID — what a broadcast takes. */
export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const templates = await listTemplates(this);
	const needle = filter?.toLowerCase() ?? '';

	const results: INodeListSearchItems[] = templates
		.filter((row) => Boolean(row.id))
		.filter((row) => !needle || (row.name ?? '').toLowerCase().includes(needle))
		.map((row) => ({
			name: `${row.name} (${row.language ?? '—'})${row.status ? ` · ${row.status}` : ''}`,
			value: row.id as string,
		}));

	return { results };
}

/**
 * Templates keyed by NAME — what a send takes. Names repeat once per
 * translation, so they are de-duplicated; the language is a separate field.
 */
export async function searchTemplateNames(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const templates = await listTemplates(this);
	const needle = filter?.toLowerCase() ?? '';
	const seen = new Set<string>();
	const results: INodeListSearchItems[] = [];

	for (const row of templates) {
		const name = row.name as string;
		if (seen.has(name)) continue;
		if (needle && !name.toLowerCase().includes(needle)) continue;
		seen.add(name);
		results.push({ name, value: name });
	}

	return { results };
}
