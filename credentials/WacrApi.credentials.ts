import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

/**
 * WA.cr API key credential.
 *
 * A key (`wacr_live_…` / `wacr_test_…`) is created under **Developers** in the
 * WA.cr console and is bound to exactly one workspace — the API resolves the
 * workspace from the key, it is never sent by the client. Add one credential
 * per workspace you need to reach.
 */
export class WacrApi implements ICredentialType {
	name = 'wacrApi';

	displayName = 'WA.cr API';

	icon: Icon = { light: 'file:wacrIcon.svg', dark: 'file:wacrIcon.dark.svg' };

	documentationUrl = 'https://api.wa.cr/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Production (api.wa.cr)', value: 'production' },
				{ name: 'Staging (api.wacart.dev)', value: 'staging' },
				{ name: 'Custom', value: 'custom' },
			],
			default: 'production',
		},
		{
			displayName: 'Custom Base URL',
			name: 'customBaseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://api.example.com',
			description: 'API host without a trailing slash and without the /v1 path',
			displayOptions: { show: { environment: ['custom'] } },
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'wacr_live_…',
			description:
				'Created under Developers in the WA.cr console and shown once. The key determines both the workspace and the scopes available to this node.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// There is no dedicated identity endpoint, so the test does the cheapest real
	// read. A key without contacts:read authenticates fine but 403s here.
	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{ $credentials.environment === "custom" ? $credentials.customBaseUrl : ($credentials.environment === "staging" ? "https://api.wacart.dev" : "https://api.wa.cr") }}',
			url: '/v1/contacts',
			qs: { limit: 1 },
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message:
						'The key is valid but lacks the contacts:read scope, which this connection test needs. Grant it in the console, or ignore this if the node only sends messages.',
				},
			},
		],
	};
}
