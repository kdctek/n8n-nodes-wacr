import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

/**
 * WA.cr Trigger shared secret.
 *
 * Auto Flow webhook events are not signed, so a header the sender and the
 * receiver both know is the only authentication available. Both halves live
 * here rather than on the node: a secret typed into a node property is stored
 * in the workflow, travels with every export and shows in plain text to anyone
 * who can open the canvas.
 *
 * The header name rides along because it is meaningless on its own — one
 * credential is one name/value pair, which is what gets pasted into the Auto
 * Flow webhook step. Reuse the same credential across as many triggers as
 * share that pair.
 *
 * There is nothing to authenticate against: WA.cr calls n8n, never the other
 * way round. The connection test is therefore local — it checks the pair can
 * be sent as an HTTP header at all. See the WA.cr Trigger node's own test.
 */
export class WacrTriggerApi implements ICredentialType {
	name = 'wacrTriggerApi';

	displayName = 'WA.cr Trigger API';

	icon: Icon = { light: 'file:wacrIcon.svg', dark: 'file:wacrIcon.dark.svg' };

	documentationUrl = 'https://api.wa.cr/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'Auth Header Name',
			name: 'authHeaderName',
			type: 'string',
			default: 'x-wacr-secret',
			required: true,
			placeholder: 'e.g. x-wacr-secret',
			description:
				'Header the Auto Flow webhook step sends. Any name works, as long as both sides agree.',
		},
		{
			displayName: 'Secret',
			name: 'secret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Value that header must carry. Requests without an exact match are rejected with 401. Generate a long random string — it is the only thing standing between your workflow and anyone who learns the URL.',
		},
	];
}
