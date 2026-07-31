import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

/**
 * Receives WA.cr Auto Flow webhook events.
 *
 * WA.cr has no webhook-subscription API, so this trigger cannot register itself
 * — `webhookMethods` create/delete are deliberately absent. Setup is manual: the
 * user copies this node's URL into an Auto Flow webhook step and adds a secret
 * header there, which this node then checks.
 *
 * Three upstream constraints shape the design, and all three are surfaced in the
 * UI rather than hidden:
 *   - The sender requires HTTPS on a publicly resolvable host. A self-hosted n8n
 *     on localhost or behind NAT will never receive anything.
 *   - There are no retries and a 10s timeout, so delivery is at-most-once.
 *   - Events are not signed, so a shared secret in a header is the only auth.
 */

/**
 * Compare without leaking length or position through timing. `crypto` would do
 * this too, but keeping it dependency-free avoids importing anything into a
 * package whose selling point is zero dependencies.
 */
function secretsMatch(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export class WacrTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WA.cr Trigger',
		name: 'wacrTrigger',
		icon: { light: 'file:wacrIcon.svg', dark: 'file:wacrIcon.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["options"]["automationId"] || "any Auto Flow"}}',
		description: 'Starts a workflow when a WA.cr Auto Flow webhook step fires',
		defaults: { name: 'WA.cr Trigger' },
		// Required by n8n's community-node rules. A trigger has no execute() and so
		// cannot actually be invoked as a tool; the type only permits `true`.
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Copy the Production URL above into a <b>Webhook</b> step in your WA.cr Auto Flow, then add a header there matching the name and secret below. WA.cr requires an <b>HTTPS URL on a public hostname</b> — a self-hosted n8n on localhost or behind NAT cannot receive these events.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Auth Header Name',
				name: 'authHeaderName',
				type: 'string',
				default: 'x-wacr-secret',
				required: true,
				description: 'Header the Auto Flow webhook step sends. Any name works, as long as both sides agree.',
			},
			{
				displayName: 'Secret',
				name: 'secret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description:
					'Value that header must carry. Requests without an exact match are rejected with 401.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Automation ID',
						name: 'automationId',
						type: 'string',
						default: '',
						placeholder: 'e.g. 7f3c1e8a',
						description:
							'Only run for events from this Auto Flow. Leave empty to accept every flow that posts here.',
					},
					{
						displayName: 'Ignore Test Events',
						name: 'ignoreTestEvents',
						type: 'boolean',
						default: false,
						description:
							'Whether to acknowledge but skip events sent by the Auto Flow test runner, which arrive with test set to true',
					},
				],
			},
		],
	};

	/**
	 * WA.cr has no webhook-subscription API, so there is nothing for n8n to
	 * register, verify or tear down remotely — the user pastes this node's URL
	 * into an Auto Flow webhook step by hand. `checkExists` therefore reports the
	 * webhook as already present, which is true from n8n's point of view, and
	 * leaves `create` and `delete` with no work to do.
	 *
	 * These are declared only because `@n8n/eslint-plugin-community-nodes`
	 * requires the full lifecycle on any node that declares `webhooks`; it makes
	 * no allowance for manually configured triggers. Omitting them changes no
	 * behaviour — the node receives events either way.
	 */
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const headerName = (this.getNodeParameter('authHeaderName') as string).toLowerCase();
		const expected = this.getNodeParameter('secret') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;

		const headers = this.getHeaderData() as Record<string, string | undefined>;
		const supplied = headers[headerName] ?? '';

		if (!secretsMatch(supplied, expected)) {
			// 401 rather than a thrown error: WA.cr records the status and moves the
			// flow on regardless, and a thrown error would surface as an execution
			// failure for what is really an unauthenticated caller.
			const res = this.getResponseObject();
			res.status(401).json({ ok: false, error: 'invalid_secret' });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData() as IDataObject;
		const flow = (body.flow ?? {}) as IDataObject;

		if (options.ignoreTestEvents === true && body.test === true) {
			return {}; // 200, but the workflow does not run
		}
		if (options.automationId && flow.automationId !== options.automationId) {
			return {};
		}

		return { workflowData: [this.helpers.returnJsonArray([body])] };
	}
}
