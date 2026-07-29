# n8n-nodes-wacr

An [n8n](https://n8n.io) community node for **[WA.cr](https://wa.cr)** — send WhatsApp and
email messages, keep contacts in sync, submit templates, fire broadcasts, upload media and
drop internal notes on a conversation, all from an n8n workflow.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Notes and limits](#notes-and-limits) · [Development](#development)

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter `n8n-nodes-wacr` and confirm.

For a self-hosted instance you can install it manually instead:

```bash
cd ~/.n8n
npm install n8n-nodes-wacr
```

Restart n8n and the **WA.cr** node appears in the node panel.

## Credentials

The WA.cr API derives the workspace from the credential — it is never sent in a URL or a
body. **One credential addresses exactly one workspace.** If you manage several, add one
credential each and pick the right one per node.

### API key (recommended)

1. In the WA.cr console open **Developers** and create a key.
2. Grant it the scopes the workflow needs (see the table below). The secret is shown once.
3. In n8n create a **WA.cr API** credential, choose the environment and paste the key.

The connection test performs a one-row contact read, so a key without `contacts:read` reports
a scope error even though it is otherwise valid — harmless if the node only sends messages.

### OAuth2 (client credentials)

Create a **WA.cr OAuth2 API** credential with the client id and secret issued for your
workspace. n8n exchanges them at `/v1/oauth/token` and refreshes the short-lived token as
needed. Trim the **Scope** field to the subset your client actually holds — asking for a scope
it was not granted fails the token request.

### Scopes by operation

| Operation | Scope |
| --- | --- |
| Message → Send | `messages:send` |
| Contact → Get, Get Many | `contacts:read` |
| Contact → Create or Update, Update, Delete | `contacts:write` |
| Note → Get Many | `comments:read` |
| Note → Add | `comments:write` |
| Template → Get Many | `templates:read` |
| Template → Create | `templates:write` |
| Broadcast → Get Many | `broadcasts:read` |
| Broadcast → Create | `broadcasts:write` |
| Media → Get Many | `media:read` |
| Media → Upload | `media:write` |

## Operations

### Message

**Send** over **WhatsApp** or **Email**.

WhatsApp takes a recipient as E.164 (with or without `+`), WhatsApp ID digits, a business
short ID, or a WA.cr contact UUID, and one of three message types:

- **Text** — plain text. Deliverable only inside an open 24-hour service window.
- **Template** — an approved template, picked from a live dropdown, plus its language code and
  an optional Cloud API `components` array for the variables.
- **Raw Message Object** — a full Cloud API message object for any type this node does not
  model (image, document, interactive, location, and so on).

Email takes an address or a contact UUID, a subject, and an HTML body.

### Contact

**Create or Update** (upserts on the phone number), **Get**, **Get Many** (search text and tag
filters), **Update**, **Delete**. Deleting a contact retains their conversation history.

Tags are entered comma-separated and sent as an array. Attributes are a JSON object. On
**Update**, both replace what is stored rather than merging.

### Note

Internal comments on a conversation — visible to your team in the console, never sent to the
customer. They hang off the contact, not a channel, so there is no channel to pick.

**Add** takes WhatsApp markup, optional `@` mentions of workspace members (each is notified by
email and WhatsApp), attached media UUIDs and an anchor message. Notes added this way show as
"via API" with no author. **Get Many** supports an **Updated After** cursor for delta polling;
deleted notes come back as tombstones so a poll can drop them.

### Template

**Get Many** lists templates with their Meta approval status. **Create** validates components
locally and submits to Meta — approval is asynchronous, so a fresh template is not immediately
sendable.

### Broadcast

**Get Many** lists broadcasts with delivery counts. **Create** dispatches to a contact group,
an explicit list of contact UUIDs, or both. Dispatch is synchronous and capped at 500
recipients; above that the API returns 413.

### Media

**Upload** a reusable media object either from **Binary Data** on the incoming item or from an
**External URL** that WA.cr fetches server-side. Either way the bytes are magic-byte validated
against WhatsApp's per-field MIME and size caps and deduped by content hash. **Get Many** lists
the library, optionally filtered by kind.

## Notes and limits

- **Rate limit** — the API rate-limits per credential (120 requests per minute at the time of
  writing). Over the ceiling it returns 429 with a `Retry-After` header, which n8n surfaces as
  a node error — so throttle a large loop yourself rather than relying on retries.
- **List sizes** — the API clamps rather than erroring. Contacts and notes cap at 500 per
  request, broadcasts and media at 200.
- **Channels** — the send endpoint accepts more channel values than this node offers, but only
  WhatsApp and email dispatch today; the rest return `channel_not_implemented`. They will be
  added here as they go live.
- **Triggers** — this package ships actions only. WA.cr has no tenant-facing webhook
  subscription yet, so to start a workflow from a WA.cr event, use an n8n **Webhook** node and
  point a WA.cr Auto Flow's *Webhook* step at its URL.
- **Errors** — WA.cr's `{ ok: false, error: { code, message } }` envelope is unwrapped into the
  node error message, with the code in the description. Turn on **Continue On Fail** to route
  failures to the output branch instead.

## Development

```bash
npm install
npm run build     # tsc + copy icons and the codex sidecar into dist/
npm run lint      # eslint-plugin-n8n-nodes-base conventions
npm test          # builds, then runs the node against a mock API
```

To try it in a local n8n:

```bash
npm run build
npm link
cd ~/.n8n/custom && npm link n8n-nodes-wacr
```

Then restart n8n.

The tests in [`test/node.test.js`](test/node.test.js) run the compiled node against a
throwaway HTTP server and assert the exact method, path and body of every operation, plus
error mapping and per-item pairing. They stub n8n's authenticated transport, so they cover
this node's request assembly — not n8n's own HTTP stack.

## Licence

[MIT](LICENSE.md)
