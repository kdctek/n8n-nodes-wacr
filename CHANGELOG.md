# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.7] — 2026-09-01

### Changed

- **README** — the *Notes and limits* → *Triggers* bullet still said the package shipped actions
  only, which stopped being true when the **WA.cr Trigger** landed in 0.3.5. It now points at the
  trigger's own section and states the real limit: setup is manual, because WA.cr has no
  programmatic webhook-subscription API. Documentation only; no code change.

## [0.3.6] — 2026-08-20

### Added

- **Contact → Create or Update now carries a Method.** *Create or Update (POST)* matches on the
  phone number and creates the contact when it is new; *Update Only (PATCH)* addresses an
  existing contact by ID and touches only the fields that are filled in. The separate **Update**
  operation is unchanged.
- **Attributes Mode** on both write paths. Attributes are written wholesale by the API, so
  *Replace* (the previous, unchanged behaviour) erases every key you leave out. *Merge* reads the
  contact first and folds your keys over the stored ones, at the cost of one extra request. Merge
  is exact on the PATCH method; on POST it finds the contact by searching the 500 most recently
  created contacts for the number, and refuses rather than guessing when two of them match.
- **Addresses** on Create or Update and Update — label, purpose, recipient name/mobile/email, two
  address lines, city, state, pincode, country, coordinates, DIGIPIN and a delivery instruction.
  The stored list is append-only, so nothing sent here replaces or removes an address the contact
  already shared, and a repeat submission is dropped rather than duplicated.
- **Source** on Create or Update — the "Via …" badge, stamped when the contact is created. An
  integration kind (`shopify`, `woocommerce`, `qtap`) keeps its brand badge; anything else is
  stored as `api:your-slug`.

- **Comment → Contact takes a mobile number or an email address**, not just an ID. The locator
  gained *By Mobile* (passed to the API as bare E.164, which is the URL form) and *By Email*
  (looked up by the node, since the API resolves IDs and phone numbers but not addresses — an
  address nobody has fails with a message naming it).
- **WA.cr Trigger: Event, Event Variable, Node ID and Simplify options.** Event matches
  comma-separated, case-insensitive labels against a run variable your Auto Flow sets (`event` by
  default), falling back to the payload's own `event` — every webhook step arrives as
  `auto_flow.node` today, so a flow-set variable is what makes one trigger URL serve many flows.
  Simplify flattens the contact and run variables to the top level, with the event's own fields
  winning a name clash.

### Changed

- The **Note** resource is now called **Comment**, which is what the console and the mobile app
  call it. Display only — the stored value was always `comment`, so saved workflows are
  untouched.

### Fixed

- An empty or malformed **Phone Number** on Create or Update now fails in the node, naming the
  field. An expression that resolved to nothing used to reach the API as a missing field and come
  back as `422 invalid_body / Required`, which names nothing at all.
- An address with a recipient but no place, or one coordinate without the other, is refused
  before the request rather than by the API.

## [0.3.5] — 2026-08-11

### Fixed

- **The WA.cr Trigger no longer declares `usableAsTool`.** A trigger has no `execute()`, so an
  AI Agent could never invoke it — the flag only advertised an affordance that did not exist.
  The action node keeps it.

## [0.3.4] — 2026-08-03

### Fixed

- Both codex sidecars now file the nodes under **Marketing & Content**, the category name n8n
  actually recognises. Plain `Marketing` matched nothing, so the nodes surfaced under
  Communication and Sales only.

### Changed

- The package description carries a literal em dash in place of a `\u2014` escape. JSON parses
  the two identically, so nothing a user sees changed — recorded only because it is in the
  release diff.

## [0.3.3] — 2026-08-03

No functional change. **0.3.3 and 0.3.4 ship byte-identical code.** Both numbers were tagged
the same afternoon to recover from three releases that the workflow's tag-matches-manifest
assertion stopped: `v0.2.2`, `v0.3.2` and a first `v0.3.3` were each pushed while `package.json`
still said `0.3.1`. The two tags then published four seconds apart — 0.3.4 at 16:05:18Z, this one
at 16:05:22Z — so the category fix described under 0.3.4 is present in both, and there is no
reason to prefer one over the other. **0.3.2 was burnt in the process** and is permanently
skipped.

## [0.3.1] — 2026-07-31

### Changed

- `author` is now `kdctek <tek@kdc.co> (https://github.com/kdctek)`, matching the npm scope, the
  GitHub owner that holds the repository, and the npm maintainer's address. Verification asks
  that the author agree between npm and the repo; `KDC <ping@wa.cr>` matched neither.

### Fixed

- `package-lock.json` recorded the package as an unscoped `n8n-nodes-wacr` at `0.1.0` — it had
  never been resynced after the rename to `@kdctek/n8n-nodes-wacr`. Metadata only; no dependency
  resolution changed.

## [0.3.0] — 2026-07-31

### Added

- **Message → Send** gained a **Contact Details** collection — **First Name**, **Last Name**,
  **Display Name**, **Email** and **Replace Existing Details**. Messaging someone the workspace
  has never spoken to creates their contact, and these name it in the same call instead of a
  second Contact node. They apply on both channels and never change the message itself. Blank
  entries are dropped, and **Replace Existing Details** is only sent alongside a detail it
  could act on.
- **Contact → Create or Update** and **Contact → Update** gained **First Name** and
  **Last Name**. **Display Name** mirrors the two unless an explicit label is set.

Both rely on fields the WA.cr API added on 2026-07-31. A deployment that predates them ignores
the fields rather than failing, so nothing breaks — the details simply are not stored.

### Removed

- The accepted-is-not-delivered notice on **Message Type → Template**. The caveat belongs where
  the trap is: a non-template send outside the 24-hour window, which the window notice already
  covers. The template path is the reliable one and no longer opens with a warning. The
  marketing-limits nuance stays documented in the README.

### Changed

- Template variable slots are now labelled with the template text around them —
  `Body 2 — “…paused. Date Time: {{2}}, and it will…”` instead of a bare `Body 2`. The wording
  either side of a placeholder is the only thing that says what a value is *for*. Long text is
  clipped at a word boundary on each side; a placeholder that is the whole component keeps the
  bare name. Slot IDs are unchanged, so saved workflows keep their mapped values.

## [0.2.1] — 2026-07-31

Clears every violation reported by `@n8n/scan-community-package`, which gates submission for
n8n's verified community node programme. No functional change to any operation.

### Changed

- Errors that escape an operation are now always wrapped as `NodeOperationError` unless they
  already carry node context, so a failure reports which node produced it instead of surfacing
  a bare message. The JSON parameter parsers raise the same type rather than a plain `Error`.
- `inputs`/`outputs` use `NodeConnectionTypes.Main` instead of the `['main']` string literal.
  **This drops support for n8n 1.x**, where that constant does not exist. n8n's own two
  linters disagree on this point; the verification scanner is the one that decides whether the
  package can be submitted.
- The trigger declares `webhookMethods` as three no-ops. WA.cr has no webhook-subscription
  API, so there is nothing to register or tear down — setup remains manual, and behaviour is
  unchanged. They exist because the scanner requires the full lifecycle on any node declaring
  `webhooks`.

### Added

- The trigger gained a `subtitle` showing the Automation ID filter, or "any Auto Flow" when
  unset, plus the `usableAsTool` property the scanner requires.

## [0.2.0] — 2026-07-31

_Supersedes 0.1.0, which was deprecated on npm: it was published from a local machine and so
carries no provenance statement, which n8n's verification guidelines require. Its contents are
otherwise identical to this release._

### Added

- **From — choose which number sends.** Message → Send gains an optional **From** resource
  locator listing the workspace's connected WhatsApp senders. Leaving it empty preserves
  WA.cr's existing routing exactly, so nothing changes for a single-number workspace.
  Setting it also narrows the template picker, language list and variable slots to the
  WhatsApp Business Account that owns the chosen sender — templates belong to one WABA and
  cannot be sent from a number on another, so an unfiltered list could offer sends that were
  guaranteed to fail. Requires the `channels:read` scope; without it the picker says so and
  the template picker falls back to listing everything rather than breaking.

- **Interactive messages** on Message → Send. Choose an Interactive Type and fill typed
  fields; the node assembles the Cloud API `interactive` object for you. All eight types
  are covered: Reply Buttons, List, Call To Action URL, Flow, Location Request, Address,
  Product and Product List — with optional text, image, video or document headers and a
  footer. Meta's limits (three buttons, ten list rows) fail before the request rather than
  as an opaque error from Graph.
- **Template variables as fields.** Picking a template now offers exactly the variable
  slots it declares — header, body and URL-button placeholders — read from the template's
  own components. The raw `components` JSON is still available under Variable Input →
  Raw JSON.
- **WA.cr Trigger** node. Starts a workflow when an Auto Flow webhook step fires. Setup is
  manual: copy the node's URL into the Auto Flow's Webhook step and add a matching secret
  header. Optional filters for Automation ID and test events.

- **Resource Locators** on every field that addresses a record. Contact (Get, Update,
  Delete), Note → Contact, Broadcast → Template and Message → Template now offer a
  searchable **From List** picker, with **By ID** kept for expressions. Contact IDs are
  validated as UUIDs; the Note locator is deliberately unvalidated because the API also
  accepts a short ID or E.164 digits.

### Fixed

- **Template variables never appeared.** Converting Template to a resource locator broke the
  variable mapper: it read the locator object rather than the template name, so it silently
  offered zero fields. Only caught by running against a live n8n.
- Location header `name` and `address` are optional, matching Meta — previously the mapper
  marked every slot required.

- List messages now nest **Rows inside Sections** instead of repeating a Section Title on
  every row, and enforce Meta's real limits: at most 10 sections and **10 rows cumulative
  across all sections**, not per section. Sections left empty are dropped rather than sent.
- Interactive headers support **Location** — `latitude`, `longitude`, `name` and `address`
  (Meta names the label `name`, not `title`).
- Template `LOCATION`-format headers were treated as a media link and would have sent a
  malformed `{ link }` parameter. They now offer four slots and build a location parameter.
- Template buttons other than URL got no variable slot at all. **Quick Reply** (`payload`)
  and **Copy Code** (`coupon_code`) are now mapped, each building its own parameter shape;
  Phone Number correctly contributes nothing, since it takes no send-time parameter.
- Interactive reply buttons now reject duplicate labels, which WhatsApp requires to be unique.

- Both credentials showed a generic `?` placeholder in the credential dialog. A credential
  declares its icon separately from the node — `ICredentialType.icon` — so adding it to the
  node classes was not enough.

### Changed

- The node now states plainly that **a successful send is not a delivered message**: everything
  except Template needs an open 24-hour service window and fails *silently* outside it (WA.cr
  accepts, so n8n reports success), and an accepted Marketing template can still be dropped by
  Meta's per-user limits.

- **Language Code is now a dropdown** loaded from the chosen template's own translations.
  A template name exists once per language and the placeholders can differ between them, so
  typing a code that did not exist failed only at send time.

- Environment labels read `Production (api.wa.cr)` and `Staging (api.wacart.dev)`; they were
  Title-cased to `Api.wa.cr`, which misrenders the hostname.
- Contact → Delete now returns `{ "deleted": true }` so downstream nodes still receive an
  item when the API answers with an empty body.
- Placeholders across the node now follow n8n's `e.g. ` convention.
- The codex sidecar declared the node as `n8n-nodes-base.wacr`; it now uses the package's
  own type.

## [0.1.0] — 2026-07-29

### Added

- **WA.cr** action node covering the public `/v1` developer API:
  - Message → Send, over WhatsApp (text, template, raw Cloud API object) or email.
  - Contact → Create or Update, Get, Get Many, Update, Delete.
  - Note → Add, Get Many (internal conversation comments, with a delta cursor).
  - Template → Get Many, Create.
  - Broadcast → Get Many, Create.
  - Media → Upload (binary or external URL), Get Many.
- **WA.cr API** credential — API key bearer auth, with a production/staging/custom
  environment selector and a connection test.
- **WA.cr OAuth2 API** credential — client-credentials grant against `/v1/oauth/token`.
- Live template dropdowns for both sending and broadcasting.
- WA.cr's error envelope unwrapped into node error messages, with Continue On Fail support.
- `usableAsTool`, so an AI Agent can call the node directly.

[Unreleased]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.7...HEAD
[0.3.7]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.3...v0.3.5
[0.3.3]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.4...v0.3.3
[0.3.4]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.1...v0.3.4
[0.3.1]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kdctek/n8n-nodes-wacr/releases/tag/v0.2.0
[0.1.0]: https://github.com/kdctek/n8n-nodes-wacr/releases/tag/v0.1.0
