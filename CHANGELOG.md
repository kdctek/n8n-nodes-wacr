# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
