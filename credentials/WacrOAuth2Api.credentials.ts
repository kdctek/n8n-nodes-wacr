import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

/**
 * WA.cr OAuth2 credential — client-credentials grant.
 *
 * `POST /v1/oauth/token` exchanges a per-workspace client id/secret for a
 * short-lived bearer token scoped to that workspace. Like an API key, one
 * client addresses exactly one workspace.
 */
export class WacrOAuth2Api implements ICredentialType {
	name = 'wacrOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'WA.cr OAuth2 API';

	icon: Icon = { light: 'file:wacrIcon.svg', dark: 'file:wacrIcon.dark.svg' };

	documentationUrl = 'https://api.wa.cr/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
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
			// Unused by the client-credentials grant, but the base credential
			// declares it — pin it empty so it never surfaces in the UI.
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default:
				'={{ $self["environment"] === "custom" ? $self["customBaseUrl"] : ($self["environment"] === "staging" ? "https://api.wacart.dev" : "https://api.wa.cr") }}/v1/oauth/token',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default:
				'contacts:read contacts:write messages:send templates:read templates:write broadcasts:read broadcasts:write media:read media:write comments:read comments:write',
			description:
				'Space-separated subset of the scopes granted to this OAuth client. Requesting a scope the client does not hold fails the token request.',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			// The token endpoint reads client_id/client_secret from the form body.
			default: 'body',
		},
	];
}
