import type { INodeProperties } from 'n8n-workflow';

/**
 * Resource locator builders.
 *
 * n8n's UX guidelines ask for a Resource Locator "whenever possible", defaulting
 * to From List — it beats making users paste a UUID they have to go and find.
 * Every locator here keeps a By ID mode so expressions still work, which is what
 * a plain string field gave before.
 */

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

interface LocatorOptions {
	name: string;
	displayName: string;
	description: string;
	displayOptions: INodeProperties['displayOptions'];
}

/** Contact picker keyed by UUID, for operations that address one contact. */
export function contactLocator(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchContacts', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: UUID_RE,
							errorMessage: 'Not a valid contact UUID',
						},
					},
				],
				placeholder: 'e.g. 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071',
			},
		],
	};
}

/**
 * Contact picker that also accepts a phone number or short ID.
 *
 * Notes hang off a contact rather than a channel, and the API resolves any of
 * UUID, business short ID or E.164 digits — so By ID is deliberately unvalidated
 * here. A UUID regex would reject input the API accepts.
 */
export function contactOrPhoneLocator(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchContacts', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. +919876543210',
			},
		],
	};
}

/**
 * Sender ("From") picker.
 *
 * Deliberately **not** `required`: omitting it preserves WA.cr's historical
 * routing exactly — reply on the channel the conversation arrived on, else the
 * workspace default, else the first verified sender. Most workspaces own one
 * number and should never have to think about this field.
 *
 * By ID is unvalidated because the API accepts either a channel id or a WABA id
 * here, and a UUID regex would reject the WABA id it documents as valid.
 */
export function senderLocator(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchChannels', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. a channel ID or a WABA ID',
				// No validation: the API accepts a channel id OR a WABA id here, and
				// a UUID regex would reject the WABA id it documents as valid.
			},
		],
	};
}

/** Template picker. `searchMethod` decides whether the value is a UUID or a name. */
export function templateLocator(
	options: LocatorOptions & { searchMethod: string; placeholder: string },
): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: options.searchMethod, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: options.placeholder,
			},
		],
	};
}
