# SaCMS User Manual & Integration Guide

**Audience:** Workspace owners, administrators, editors, contributors, reviewers, and developers  
**Baseline:** 19 June 2026  
**Verification note:** UI labels/paths were synchronized by static inspection; no browser acceptance test was run.

## 1. Product areas

SaCMS separates two working areas:

- **Workspace Dashboard** — schema, components, members, roles, localization, billing, API tokens, webhooks, settings, and developer tools under `/dashboard/{tenant}`.
- **Content Studio** — day-to-day Collection content, Single Types, media, review, history, and profile under `/cms/{tenant}`.

Platform super administrators also have `/admin` pages for global schemas, tenants, users, billing, monitoring, settings, and audit logs.

## 2. Sign in and account recovery

### 2.1 Credentials

1. Open `/login`.
2. Enter email and password.
3. If email has not been verified, SaCMS sends a new verification link and stops sign-in.
4. After verification, sign in again.

### 2.2 OAuth

Google or GitHub buttons are available only when the deployment configured those providers.

### 2.3 Password recovery

- Request recovery at `/forgot-password`.
- Complete the token flow at `/reset-password`.
- Do not share or forward recovery links.

## 3. Workspace selection and creation

After sign-in, open `/dashboard` to view workspaces available to the account.

Creating a workspace is subject to the account's `max_workspaces` limit. The workspace plan is also checked against the account plan hierarchy. If creation is blocked:

1. Review current account/workspace plans.
2. Remove an unused owner workspace, request an override, or upgrade.
3. Retry creation after the plan state is updated.

The workspace slug becomes part of dashboard, CMS, and API URLs. Treat it as a stable integration identifier.

Canonical plan limits used by the server:

| Account plan | Max workspaces |
|---|---:|
| Free | 1 |
| Starter | 3 |
| Pro | 10 |
| Enterprise | 20 |
| Custom | Approved override |

| Workspace plan | Content types | Entries | Team members | Storage | Locales | API calls/month |
|---|---:|---:|---:|---:|---:|---:|
| Free | 3 | 500 | 1 | 100MB | 1 | 1,000 |
| Starter | 5 | 5,000 | 3 | 1GB | 2 | 10,000 |
| Pro | 10 | 10,000 | 10 | 5GB | 5 | 100,000 |
| Enterprise | 20 | 20,000 | 20 | 10GB | 20 | 1,000,000 |
| Custom | Approved override | Approved override | Approved override | Approved override | Approved override | Approved override |

## 4. Workspace navigation

Common Dashboard sections:

| Group | Menu | Purpose |
|---|---|---|
| Content | Content Studio | Open the separate authoring interface |
| Content | Overview | Workspace summary and onboarding |
| Content | Content Types | Collection schema and entries |
| Content | Single Types | One-record schemas such as site settings |
| Content | Components | Reusable nested field groups |
| Content | Media Library | Files and metadata |
| Management | Team Members | Membership and role assignment |
| Management | Roles & Permissions | Built-in/custom RBAC |
| Management | Localization | Enabled/default locales |
| Management | Billing & Plans | Subscription, invoices, usage |
| Developer | API Tokens | Public integration credentials |
| Developer | Webhooks | Event delivery and hooks |
| Developer | GraphQL Explorer | Dynamic schema/query exploration |
| Developer | REST API | Public API guidance |
| Developer | SDK & Docs | Generated integration resources |
| Settings | Audit Trail | Tenant activity history |
| Settings | Workspace Settings | General and White-Label configuration |

Visibility may differ by role. Server authorization remains authoritative if a stale UI still displays a restricted link.

## 5. Schema modeling concepts

### 5.1 Collection Type

Use for repeatable records: articles, products, events, people, or documents. Data is stored as `ContentEntry` and participates in the full workflow.

### 5.2 Single Type

Use for one logical record per locale: site settings, homepage, about page, contact configuration. Single Types do not use the Collection reviewer state machine.

### 5.3 Component

Use for reusable nested structures: SEO metadata, buttons, addresses, hero blocks, link groups. A component may be repeatable when configured by the parent field.

### 5.4 Global and tenant-owned schemas

- Tenant-owned schema belongs to one workspace.
- Global schema has no tenant owner and can be assigned/enabled for selected tenants.

## 6. Create a Collection Type

1. Open `/dashboard/{tenant}/content-types`.
2. Select **New Content Type**.
3. Enter display name, slug, and description.
4. Add fields in the intended display order.
5. Configure required, unique, localizable, options, relation target, or component target.
6. Save/publish the schema.

Creation may fail when `max_content_types` has been reached.

### 6.1 Field type reference

| Type | Typical value | Notes |
|---|---|---|
| `text` | Short string | Text fields are limited by validation policy |
| `textarea` / `markdown` | Long plain/Markdown text | Multi-line authoring |
| `richText` | HTML/rich editor content | Sanitize in consuming frontend |
| `slug` / `uid` | URL-safe identifier | May auto-generate from title/name |
| `email` | Email string | Format-validated |
| `integer` / `number` | Numeric value | UI/backend representation must stay consistent |
| `boolean` | `true`/`false` | Initialized as false in create form |
| `date` / `datetime` | Date/ISO value | Content field, separate from workflow schedule |
| `select` | One configured option | Options stored in field metadata |
| `tags` | String list | Used for labels/hashtags |
| `media` / `file` | One asset reference | Uses tenant media library |
| `mediaMultiple` | Asset reference list | Initialized as empty list |
| `relation` | Entry ID or ID list | Cardinality comes from options |
| `component` | Object or object list | Uses selected Component schema |
| `json` | JSON value | Use cautiously in public contracts |
| `color` | Color value | Specialized renderer |
| `location` | Structured location | Specialized renderer |

### 6.2 Required, unique, and localizable

- **Required:** enforced when content leaves `DRAFT`; Draft may stay incomplete.
- **Unique:** checked within the content type and tenant.
- **Localizable:** each locale has its own value.
- **Non-localizable:** changes are copied to the other translation variants.

### 6.3 Component impact analysis

Component management shows where a component is referenced and warns before deleting an in-use component. Review every affected schema before destructive changes; existing JSON content may still contain historical component-shaped data.

## 7. Collection content workflow

Open Content Studio at `/cms/{tenant}/content/{contentType}`.

### 7.1 Create a draft

1. Select **New Entry**.
2. Fill any known fields.
3. Keep status `DRAFT`.
4. Select locale.
5. Save.

Required fields may remain empty in Draft, but malformed types or duplicate unique values can still be rejected.

### 7.2 Submit for review

1. Complete all required fields.
2. On an existing Draft, assign reviewers if the workspace uses sequential review.
3. Change status to `IN_REVIEW`.
4. Save.

Only transitions permitted for the current role appear in the status selector. The server checks again during save.

### 7.3 Review an entry

When it is your turn, the **Review Workflow** card displays comment, **Request changes**, and **Approve** controls.

- Approval moves to the next reviewer.
- Final approval moves the entry to `APPROVED`.
- Requesting changes moves it to `REJECTED`.
- A later reviewer cannot act early.

### 7.4 Publish now

Owner/admin may publish directly from Draft or publish an Approved entry. Publishing:

- Sets `PUBLISHED` and `publishedAt`.
- Makes the entry available to read-only Public API tokens.
- Emits publication webhooks.
- Invalidates the collection API cache.

### 7.5 Schedule publication

Owner/admin may choose a future date and save as `SCHEDULED`. The repository's Vercel scheduler currently runs every five minutes, so an entry becomes live on the first successful scheduler run after the chosen time.

### 7.6 Unpublish, archive, and restore

- `PUBLISHED → DRAFT`: removes public visibility and allows editing.
- `PUBLISHED → ARCHIVED`: retires content without deleting history.
- `ARCHIVED → DRAFT`: restores it to editing.
- `REJECTED → DRAFT`: starts revision.

See document 14 for the complete transition matrix and side effects.

## 8. Version history and preview

The edit page exposes Content History and Preview controls.

- Each successful create/update records a `ContentVersion` snapshot.
- Restoring a version updates editor data; review the resulting status before publishing.
- Preview opens `/preview/{tenant}/{contentType}/{entryId}` when a corresponding preview route is available/configured.

## 9. Localization workflow

### 9.1 Configure locales

1. Open `/dashboard/{tenant}/localization`.
2. Add a locale within the plan limit.
3. Choose one default locale.
4. Disable/delete only after assessing existing translated content and integrations.

### 9.2 Translate a Collection entry

1. Open the base entry.
2. Select another enabled locale.
3. When no variant exists, the base data is shown as a template.
4. Replace localizable values.
5. Save; the new variant shares `documentId` with the base entry.

Public clients select locale using `?locale=id`. Response entries include `availableLocales` when document variants are known.

## 10. Single Types

1. Create/assign a Single Type in Dashboard.
2. Open `/cms/{tenant}/single-types`.
3. Select the Single Type.
4. Edit fields for the selected locale.
5. Save/publish according to the Single Type page controls.
6. If you omit `?locale=` in API access, the tenant default locale is used automatically.

Public read:

```http
GET /api/public/{tenant}/single/{singleType}?locale=id
Authorization: Bearer <token>
```

A `read-only` token only sees the published variant for the resolved locale. A `full-access` token may update the supported Single Type REST endpoint with `PUT` using the same locale resolution rules.

## 11. Media Library

Open `/cms/{tenant}/media` or `/dashboard/{tenant}/media`.

Typical operations:

- Upload files.
- Organize with folders.
- Update alt text/caption/metadata.
- Select media from Collection/Single Type fields.
- Delete assets when no longer used.

Image uploads may create thumbnail and medium variants. Storage consumption counts toward the workspace plan. Deleting an asset can break content that still stores its URL/reference; search references before deletion.

## 12. Team members and roles

### 12.1 Invite/add a member

1. Open `/dashboard/{tenant}/users`.
2. Add an email and choose a role.
3. The API resolves/adds membership according to the current member workflow.

Do not promise email delivery unless SMTP/invitation behavior is configured and confirmed for the deployment.

### 12.2 Built-in roles

| Role | Typical use |
|---|---|
| Owner | Workspace ownership, billing, destructive operations |
| Admin | Workspace administration and publication |
| Editor | Content authoring and permitted transitions |
| Member | Basic contribution and review submission |
| Viewer | Read-only workspace access |

Custom roles use granular permissions. Owner remains a privileged bypass for most tenant permission checks.

## 13. API tokens

Open `/dashboard/{tenant}/api-keys`.

### 13.1 Create

1. Enter name, description, token type, permissions, and optional expiry.
2. Create the token.
3. Copy the plaintext token immediately; it will not be retrievable later.
4. Store it in a server-side secret manager.

### 13.2 Token types

- `read-only`: published content only.
- `full-access`: permitted mutations and non-published status queries on supported endpoints.

### 13.3 First REST request

```bash
curl \
  -H "Authorization: Bearer cf_your_token" \
  "https://your-host/api/public/acme/content/articles?locale=id&page=1&pageSize=10"
```

### 13.4 Filtering example

```text
?filters[category][$eq]=technology
&filters[title][$contains]=next
&sort=createdAt:desc
&fields=title,slug,summary
&populate=author
```

Rotate/revoke tokens after exposure, staff/vendor changes, or according to organizational policy.

## 14. GraphQL integration

Endpoint:

```text
POST /api/public/{tenant}/graphql
```

Use GraphQL Explorer at `/dashboard/{tenant}/developer/graphql` to inspect tenant-generated types. Queries work with a valid token. Mutations require `full-access`.

Paste `Authorization: Bearer <YOUR_API_TOKEN>` into Apollo Sandbox headers. SaCMS never auto-injects the stored SHA-256 hash because that hash is not a usable plaintext token and must remain undisclosed.

Example:

```graphql
query {
  articles(page: 1, limit: 10, sort: "createdAt", order: "desc") {
    data { id title slug }
    meta { total totalPages }
  }
}
```

## 15. MCP server integration (Antigravity & VS Code)

SaCMS exposes a Model Context Protocol (MCP) server so the AI agent built into **Antigravity** or **VS Code** (GitHub Copilot Chat, Agent mode) can design, build, populate, and deploy a tenant's schema and content directly from a normal chat session in that IDE, with no separate SaCMS UI open. These are the only two clients this integration is documented/supported for.

```text
Endpoint: https://your-host/api/mcp
Auth:     Authorization: Bearer <API_TOKEN>  (or ?token=<API_TOKEN>)
Transport: Streamable HTTP (MCP 2025-03-26)
```

Use a `full-access` token from `/dashboard/{tenant}/developer/api-keys` (document 13) — read-only tokens can only use the read-side tools (`list_*`, `get_*`, `query_content`).

### 15.1 Configure in VS Code

VS Code's native MCP support (Copilot Chat, Agent mode) reads `.vscode/mcp.json` in the workspace, or the equivalent entry in user settings:

```json
{
  "servers": {
    "sacms": {
      "type": "http",
      "url": "https://your-host/api/mcp",
      "headers": {
        "Authorization": "Bearer ${input:sacmsToken}"
      }
    }
  },
  "inputs": [
    { "id": "sacmsToken", "type": "promptString", "description": "SaCMS API token", "password": true }
  ]
}
```

Reload the window, then open Copilot Chat in Agent mode — the `sacms` tools appear in the tools picker.

### 15.2 Configure in Antigravity

Antigravity reads MCP servers from its own settings panel (Settings → MCP Servers) or an equivalent `mcp.json`, using the same shape as above (`type: "http"`, `url`, `headers`). Point it at the same `/api/mcp` endpoint and Bearer token — there is no SaCMS-specific Antigravity plugin; it connects to the exact same generic MCP server as VS Code.

### 15.3 What the agent can do once connected

Once the IDE's agent has the `sacms` tools available, a normal chat prompt — no special UI, no dedicated panel — can drive the same operations this manual's other sections cover manually:

- Schema: `create_content_type`, `update_content_type`, `delete_content_type`, `create_single_type`, `create_component`, `list_field_types`, `get_full_schema`.
- Content: `create_content_entry`, `update_content_entry`, `query_content`, `get_content_entry`.
- Members & webhooks: `create_member`, `list_members`, `create_webhook`, `test_webhook`.
- Infrastructure & deploy: `deploy_to_vercel`, `get_vercel_deployment_status`, `configure_vercel_domain`, `add_vercel_env`, `provision_contabo_vps`, `get_contabo_infrastructure_status`.

The agent still operates strictly within the token's tenant and permission scope — it cannot see or touch another tenant's data, and a read-only token cannot call the `create_*`/`update_*`/`delete_*`/`deploy_*` tools.

### 15.4 Known limitation: no visual panel

MCP is a tool-calling protocol, not a UI framework — connecting the server above gives Antigravity's or VS Code's AI agent new things it can *do* via that IDE's own chat interface, not a SaCMS-branded prompt box, live preview pane, or Deploy button rendered inside the IDE. A dedicated visual panel (type a prompt in a custom sidebar, see a live preview, click Deploy) would need a separate VS Code Extension (and a separate Antigravity-specific integration, since MCP config alone cannot add a custom webview) built against SaCMS's existing generate-frontend/deploy APIs — a different, larger project from connecting this MCP server.

## 16. Webhooks

Open `/dashboard/{tenant}/webhooks`.

### 16.1 Async webhook

Use for notifications such as deployment hooks. Configure URL, events, optional secret, and headers. Main content save does not wait for final delivery. Failures enter the DLQ.

### 16.2 Sync hook

Use for pre-save policy/integration. A sync hook may:

- Return success with replacement `data`.
- Return `{ "reject": true, "message": "..." }`.
- Time out/fail, incrementing its circuit-breaker failure count.

### 16.3 Signature verification

When a secret is configured, verify `X-Webhook-Signature` as HMAC-SHA256 over the exact raw request body. Do not parse and reserialize before signature verification.

### 16.4 DLQ

Inspect dead letters and replay authorized entries from the Webhook UI/API. The cron retry job processes due entries with exponential backoff and eventually marks exhausted messages.

## 17. Billing and subscription

Open `/dashboard/{tenant}/subscriptions`.

Typical flow:

1. View plans and current usage.
2. Select upgrade/downgrade.
3. Review proration where applicable.
4. Start checkout.
5. Complete payment in the configured provider UI (Midtrans is the primary documented provider).
6. Provider notification updates transaction/subscription state.
7. Return to payment result/status page.

Available tenant operations include plan list, plan change, cancel, proration, invoices, and usage. Exact payment behavior depends on production provider credentials and webhook configuration.

Never infer payment success only from the browser redirect; use the server/provider transaction status.

## 18. AI authoring

When the tenant has `ai-gen` or an Enterprise/Custom plan and the server has `DEEPSEEK_API_KEY`:

1. Open a Collection create/edit form.
2. Use **Smart Fill** to propose multiple field values.
3. Review facts, HTML, relation IDs, and media URLs.
4. Save as Draft and use the normal workflow.

AI cannot bypass required fields or publication permissions. See document 12 for exact API payloads and privacy boundaries.

## 19. White-Label and custom domain

Eligible Pro/Enterprise/Custom workspaces open:

```text
/dashboard/{tenant}/settings/white-label
```

Save brand name/logo/color, then register one hostname, add DNS TXT/CNAME, and trigger verification. After verification use custom-host paths such as:

```text
https://cms.example.com/content/articles
```

Bearer token remains required. See document 13.

## 20. Audit and monitoring

- Tenant Audit Trail records supported content/settings/member/security operations.
- API usage/monitoring pages read `ApiRequest` and metrics records.
- Sentry reporting appears only when deployment configuration enables it.
- Audit retention values are plan-dependent; automatic purge must be operated separately.

## 21. Troubleshooting by symptom

| Symptom | First check |
|---|---|
| Workspace missing | Membership and tenant status |
| Create schema blocked | Content Type plan usage |
| Draft cannot submit | Required fields, field types, unique constraints |
| Status option missing | Current status, role, custom transition permission |
| Review buttons missing | Current reviewer order and logged-in user |
| Scheduled item not live | Future date, cron secret, last scheduler run |
| Public API 401 | Bearer syntax, token value, expiry |
| Public API 403 | Token belongs to another tenant or read-only requested draft |
| Public API old content | Cache invalidation/Redis state and mutation path |
| Media upload fails | R2 configuration, MIME/size, storage plan |
| AI 403/503 | Add-on/plan and `DEEPSEEK_API_KEY` |
| Custom domain verified but not routing | Redis domain mapping; repeat verification |
| Payment remains pending | Provider dashboard, webhook URL/secret, transaction record |
| Webhook not delivered | Webhook logs, enabled events, DLQ, retry cron |
| MCP server not found in IDE | Config file location/syntax for that client, window reload |
| MCP tools return 401 | Bearer token value/expiry, same check as Public API 401 |
| MCP write tools unavailable | Token is `read-only` — reissue as `full-access` |

## 22. Safe operating habits

- Draft first for incomplete or AI-generated content.
- Use review for high-impact content.
- Avoid deleting schema fields/components/media without impact review.
- Keep API tokens server-side and rotate exposed credentials.
- Use separate credentials/databases for development and production.
- Record changes in Release Notes only after implementation exists.
- Keep documents 14 and 15 updated whenever workflow or capability status changes.
