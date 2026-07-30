# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kdctek/n8n-nodes-wacr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kdctek/n8n-nodes-wacr/releases/tag/v0.1.0
