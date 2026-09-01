# @kdctek/n8n-nodes-wacr

An [n8n](https://n8n.io) community node for **[WA.cr](https://wa.cr)** — send WhatsApp and
email messages, keep contacts in sync, submit templates, fire broadcasts, upload media and
drop internal notes on a conversation, all from an n8n workflow.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Notes and limits](#notes-and-limits) · [Development](#development)

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter `@kdctek/n8n-nodes-wacr` and confirm.

For a self-hosted instance you can install it manually instead:

```bash
cd ~/.n8n
npm install @kdctek/n8n-nodes-wacr
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
| Message → Send, **From** picker | `channels:read` |
| Contact → Get, Get Many | `contacts:read` |
| Contact → Create or Update, Update, Delete | `contacts:write` |
| Comment → Get Many | `comments:read` |
| Comment → Add | `comments:write` |
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
- **Template** — an approved template, picked from a live dropdown, plus its language code.
  Set **Variable Input** to **Fields** and the node offers exactly the variables that template
  declares — header, body and URL-button placeholders — read from the template itself. Each is
  labelled with the wording around it, `Body 2 — “…paused. Date Time: {{2}}, and it will…”`, so
  you can see what the value is for without opening the template. Choose **Raw JSON** to supply
  the Cloud API `components` array by hand instead.
- **Interactive** — buttons, menus, links and more, assembled for you from typed fields. See
  below.
- **Raw Message Object** — a full Cloud API message object for any type this node does not
  model (image, document, location, and so on).

#### Choosing which number to send from

A workspace can own several WhatsApp numbers. **From** picks which one sends; leaving it
empty keeps WA.cr's own routing — reply on the number the conversation arrived on, else the
workspace default. Most workspaces own one number and can ignore the field entirely.

It matters for templates. A template belongs to exactly one WhatsApp Business Account and
can only be sent from a number on that WABA, so a workspace with two WABAs has two disjoint
template lists. Setting **From** narrows the template picker to the templates that sender can
actually send, which is the difference between a dropdown you can trust and one where some
entries fail at send time.

The picker lists only **connected** senders, because those are exactly the ones the API
accepts — naming a disabled, pending or offboarded number is refused rather than quietly
redirected to a different business identity. **By ID** accepts either a channel ID or a WABA
ID.

The picker needs the `channels:read` scope. On a key issued before that scope existed the
dropdown will report it is missing; everything else keeps working, and the template picker
falls back to listing all templates rather than failing.

#### Interactive types

Pick an **Interactive Type**, then fill only the fields it needs. Each accepts an optional
header (text, image, video or document) and footer.

| Type | What the recipient sees |
| --- | --- |
| **Reply Buttons** | Up to three tappable buttons. IDs default to the button label. |
| **List** | A menu of up to ten rows. Rows sharing a **Section Title** are grouped together. |
| **Call To Action URL** | A button that opens a link, without showing the raw URL. |
| **Flow** | Launches a published WhatsApp Flow, with an optional screen and payload. |
| **Location Request** | A prompt to share their location. |
| **Address** | A delivery-address form. India and Brazil only. |
| **Product** | One catalogue product. |
| **Product List** | Several catalogue products, grouped into sections. |

Meta's limits — three buttons, ten list rows — are checked before the request, so you get a
clear error instead of a rejection from Graph. Product, Product List and Flow need a Meta
catalogue or a published Flow configured on your WABA.

Email takes an address or a contact UUID, a subject, and an HTML body.

#### Naming the recipient in the same call

You do not have to create the contact first. Message someone the workspace has never spoken to
and, once the message is accepted, a contact is created for them automatically — so the
conversation opens in the inbox as a normal, fully actionable chat. If the send is refused, no
contact is created.

**Contact Details** names that person in the same call, instead of a second Contact → Create or
Update node. It applies on both channels and never changes the message itself.

| Field | What it does |
| --- | --- |
| **First Name**, **Last Name** | The person's name. The inbox label is built from them. |
| **Display Name** | An explicit label instead of the built one, e.g. `Asha M. (VIP)`. |
| **Email** | Their email address, stored on the contact. On the Email channel it has to match **To**, which is the same address — the API refuses a contradiction rather than picking a winner. |
| **Replace Existing Details** | Whether details they **already** have may be overwritten. |

Leave **Replace Existing Details** off (the default) and anything missing is still filled in;
only details already on record are left alone. On a brand-new contact every field is empty, so
everything applies and the toggle makes no difference. A display name someone typed into WA.cr
by hand is never overwritten — the name fields update beneath it.

#### A successful send is not a delivered message

Two things catch people out. The node flags the first in the UI, where it is a real trap; the
second is worth knowing before you build on templates:

- **Everything except Template needs an open 24-hour service window** — within 24 hours of the
  contact's last inbound message. Outside it, WA.cr still *accepts* the message, so **this node
  reports success and the failure only shows up later in WA.cr**. There is no error in n8n to
  branch on. A Template is the only way to open a new conversation.
- **An accepted template is not a guaranteed delivery.** Marketing templates in particular can
  be dropped by Meta's per-user marketing limits and quality rules. The node returns
  `acceptedAt` and a `providerMessageId`; treat that as "handed over", not "read".

If a workflow depends on the message actually arriving, check status in WA.cr rather than
inferring it from this node's output.

### WA.cr Trigger

Starts a workflow when an Auto Flow **Webhook** step fires.

WA.cr has no webhook-subscription API, so setup is manual and takes a minute:

1. Add the **WA.cr Trigger** node and copy its **Production URL**.
2. In your WA.cr Auto Flow, add a **Webhook** step and paste that URL in.
3. On the same step add a header — `x-wacr-secret` by default — and set it to the same
   **Secret** you enter on the node. Requests that do not match are rejected with 401.

Three limits are worth knowing before you build on it:

- **Your n8n must be reachable over HTTPS on a public hostname.** WA.cr refuses plain HTTP,
  IP addresses and private or internal names. A self-hosted n8n on `localhost` or behind NAT
  will never receive events, and n8n's "listen for test event" URL will not work locally.
- **Delivery is at-most-once.** There is a 10-second timeout and no retries, so an event is
  lost if n8n is slow or down. Do not use it as the only record of something important.
- **It fires per flow step, not per account.** The trigger means "this Auto Flow reached this
  step" — it is not a feed of every inbound message.

#### What arrives

Every webhook step posts the same shape. `event` is `auto_flow.node` on all of them — WA.cr does
not yet name what triggered the run — so the event's *meaning* is whatever your flow puts in
`variables`:

```json
{
  "event": "auto_flow.node",
  "firedAt": "2026-08-20T10:00:00.000Z",
  "test": false,
  "tenantId": "…",
  "flow": { "automationId": "…", "versionId": "…", "nodeId": "…" },
  "enrolmentId": "…",
  "contact": {
    "id": "…", "name": "Sam", "identities": { "e164": "+919876543210" },
    "attributes": {}, "tags": [], "country": "IN", "source": "wa_chat"
  },
  "variables": { "orderId": "1234" }
}
```

#### Filtering and shaping

| Option | What it does |
| --- | --- |
| **Automation ID** | Only run for this Auto Flow |
| **Node ID** | Only run for this webhook step — each step has its own URL, so this matters only when several share one trigger |
| **Event** | Comma-separated labels, case-insensitive. Matched against the run variable named below, falling back to the payload's own `event`. |
| **Event Variable** | Which run variable carries the label (default `event`) |
| **Ignore Test Events** | Acknowledge but skip events from the Auto Flow test runner |
| **Simplify** | Flatten the event — `contactId`, `name`, `phone`, `tags`, `attributes`, `automationId`, `nodeId` and your run variables at the top level. The event's own fields win a name clash; turn it off for the payload exactly as it arrived. |

To use **Event**, set a variable in the Auto Flow before the webhook step — `event = order_paid`
— and filter on it here. One trigger URL can then serve many flows, and the branch logic reads
as an event name rather than a flow UUID.

#### What you can trigger on today

The webhook step can sit after any Auto Flow trigger, so these all reach n8n: an inbound
WhatsApp message (first message, keyword, media, location, shared contact, interactive reply, a
completed WhatsApp Flow), a customer-service window about to close with no reply, a store order
placed, paid or fulfilled, a click-to-WhatsApp ad click, a payment confirmation, a contact
tagged or added to a segment, broadcast engagement, a signup opt-in, and an inbound webhook from
another system.

Appointments and voice events (booked, approved, missed call, incoming call) have no Auto Flow
trigger yet, so there is nothing to attach a webhook step to — they are not available to this
node.

### Contact

**Create or Update**, **Get**, **Get Many** (search text and tag filters), **Update**,
**Delete** (returns `{ "deleted": true }`). Deleting a contact retains their conversation
history.

Operations that address one contact use a **Resource Locator** — pick from a searchable list,
or switch to **By ID** to paste a UUID or drive it from an expression. The same applies to
Comment → Contact and to the template pickers on Message and Broadcast.

#### Create or Update: which method to use

**Create or Update** carries a **Method**, because the two ways of writing a contact behave
differently:

| Method | Addressed by | Behaviour |
| --- | --- | --- |
| **Create or Update (POST)** | Phone Number (E.164, leading `+`) | Creates the contact when the number is new. Names and tags are written wholesale — leave Tags empty and a contact that already exists is left with none. |
| **Update Only (PATCH)** | Contact (list or ID) | Touches only the fields you fill in. Fails with `not_found` if the contact is gone. |

**Update** is the same PATCH call with the same fields, kept as its own operation.

The phone number is checked in the node before anything is sent: an expression that resolves to
nothing would otherwise reach the API as a missing field and come back as a bare
`422 invalid_body / Required`, which names no field.

#### Attributes

Attributes are a JSON object keyed by the custom-field names your workspace defined. **Both**
methods write the bag wholesale, so **Attributes Mode** decides what happens to the keys you did
not send:

- **Replace** (default) — send only these attributes. Every other key is erased.
- **Merge** — read the contact first, then fold your keys over the stored ones. Costs one extra
  request against the 120/minute limit.

Merge on **Update Only (PATCH)** is exact: it reads the contact by ID. Merge on **Create or
Update (POST)** finds the contact by searching the 500 most recently created contacts for the
number, so on a very large workspace an old contact can fall outside that window and the write
degrades to a replace — use the PATCH method when the merge has to be guaranteed. Two matches
with no exact number (a workspace that masks digits) fails rather than guessing.

#### Names, tags and source

**First Name** and **Last Name** hold the person's name; **Display Name** is the label the inbox
shows. Leave the display name empty and it mirrors the first and last name — set it and your
label wins from then on. Tags are entered comma-separated, sent as an array, and replace what is
stored.

**Source** is the "Via …" badge, stamped when the contact is **created** and never rewritten —
so it only appears on the POST method. Use an integration kind (`shopify`, `woocommerce`,
`qtap`) to get its brand badge, or a short slug of your own, which is stored as `api:your-slug`.
Platform values are refused with `invalid_source`.

#### Addresses

**Addresses** adds postal addresses to the contact on either method. The stored list is
**append-only**: nothing you send replaces or removes an address the contact already shared, and
an entry identical to a stored one is dropped rather than duplicated, so a workflow that runs on
a schedule will not grow the list.

Each address takes a label, purpose (billing/shipping/unclassified), recipient name, mobile and
email, two address lines, city, state, pincode, country (code or name — resolved to the ISO
code), coordinates, DIGIPIN and a delivery instruction. Every field is optional, but an address
needs at least one field saying *where* — a line, city, state, pincode, label, DIGIPIN or a pair
of coordinates. Latitude and longitude are typed as text and must be given together; leave them
empty and no coordinate is sent. Inside India the DIGIPIN is worked out from the coordinates
when you do not supply one.

Addresses come back on **Get** as `addresses`, alongside the contact's `source`.

### Comment

Internal comments on a conversation — visible to your team in the console and the mobile app,
never sent to the customer. They hang off the contact, not a channel, so there is no channel to
pick.

**Add** takes WhatsApp markup, optional `@` mentions of workspace members (each is notified by
email and WhatsApp), attached media UUIDs and an anchor message. Comments added this way show as
"via API" with no author. **Get Many** supports an **Updated After** cursor for delta polling;
deleted comments come back as tombstones so a poll can drop them.

Address the contact whichever way your workflow knows them — the locator has four modes:

| Mode | Takes | Resolved |
| --- | --- | --- |
| **From List** | a searchable picker | — |
| **By ID** | contact UUID, or a business short ID | by the API, exactly |
| **By Mobile** | E.164 with or without the leading `+` | by the API, exactly |
| **By Email** | an email address | by the node, which looks the contact up first and fails if no one has that address |

By Email costs one extra request, and its lookup searches the 500 most recently created contacts
rather than indexing the address — so on a very large workspace, prefer ID or mobile.

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
- **Triggers** — the **WA.cr Trigger** requires manual setup: WA.cr has no programmatic
  webhook-subscription API, so the webhook URL must be pasted into the Auto Flow by hand. See
  [WA.cr Trigger](#wacr-trigger) above.
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
cd ~/.n8n/custom && npm link @kdctek/n8n-nodes-wacr
```

Then restart n8n.

The tests in [`test/node.test.js`](test/node.test.js) run the compiled node against a
throwaway HTTP server and assert the exact method, path and body of every operation, plus
error mapping and per-item pairing. They stub n8n's authenticated transport, so they cover
this node's request assembly — not n8n's own HTTP stack.

## Licence

[MIT](LICENSE.md)
