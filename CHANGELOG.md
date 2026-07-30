# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

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
