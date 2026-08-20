# Conversion Guide: Dograh → Full-Fledged Voice Agent SaaS with CRM

This document is the master playbook for converting the Dograh voice-AI codebase
into a rebranded, commercial, multi-tenant SaaS voice-agent platform with a
built-in CRM. It is written against the actual repository layout, so every step
references real files.

Conventions used throughout:

- `{{BRAND}}` — new product name, e.g. "Voxly" (replace everywhere, case-insensitively, watching for `dograh`, `Dograh`, `DOGRAH`, `dograh-hq`, `dograhai`).
- `{{DOMAIN}}` — new primary domain, e.g. `voxly.ai` (replaces `dograh.com`, `app.dograh.com`, `docs.dograh.com`).
- `{{GHCR_ORG}}` — new container-registry org (replaces `dograh-hq` / `dograhai`).

Do the brand rename as a **global, case-sensitive-aware search** for `dograh`
first to catch everything, then use the file-specific guidance below for the
spots that need judgment (logos, colors, domain allowlists, image names).

---

## Phase 0 — Positioning & Product Decisions (DONE)

Decide these before touching code; everything downstream depends on them.

1. **New brand identity**: name, domain, logo (mark + wordmark, light/dark),
   brand colors (primary CTA color + accent), favicon set, social/OG image.
2. **ICP & packaging**: who buys this (sales teams, support teams, agencies) and
   how the CRM is positioned — built-in lightweight CRM vs. sync layer for
   HubSpot/Salesforce. Recommendation: build a native CRM (contacts, companies,
   deals, activities) AND keep integration hooks; the native CRM is what makes
   the voice agents immediately useful (auto-log calls, auto-update leads).
3. **Pricing model** (drives the billing work in Phase 5):
   - Tiered subscriptions: Starter / Growth / Scale.
   - Metered voice minutes + LLM tokens on top (the existing
     `OrganizationUsageCycleModel` metering already supports this).
   - Per-seat pricing for CRM users.
4. **Deployment split**: keep the OSS self-hostable path working
   (`docker-compose.yaml`, no-auth OSS mode) while the SaaS runs the same image
   with Stack Auth + billing enabled. Do not fork the two.

---

## Phase 1 — Rebranding (DONE)

### 1.1 Frontend (`ui/`)

| File | Change |
|---|---|
| `ui/src/app/layout.tsx:33` | `metadata.title: "Dograh"` → `{{BRAND}}`; update description/OG tags |
| `ui/public/dograh-logo.png`, `dograh-logo-inverse.png`, `dograh-mark.png` | Replace with new logo files (rename to `{{brand}}-logo.png` etc. and update all imports) |
| `ui/public/brand-imprint-light.svg`, `brand-imprint-dark.svg` | Regenerate the faded background wordmark SVGs with the new name |
| `ui/src/app/favicon.ico` | New favicon |
| `ui/src/app/globals.css:85-89,235,258` | Update theme tokens: `--cta` brand color (currently `oklch(0.72 0.15 65)` orange), `--brand-imprint` URLs, comments referencing dograh.com |
| `ui/src/app/auth/login/`, `ui/src/app/auth/signup/` | Brand text and imprint usage on auth pages |
| `ui/src/app/settings/page.tsx` | "your Dograh workspace" copy |
| `ui/src/app/api-keys/page.tsx` | "Dograh Service Keys", `app.dograh.com` links |
| `ui/src/app/billing/page.tsx`, `ui/src/app/usage/page.tsx` | "Dograh Tokens" → "{{BRAND}} Credits" (or new currency name) |
| `ui/src/app/files/DocumentUpload.tsx` | Brand copy |
| `ui/src/app/workflow/[workflowId]/components/EmbedDialog.tsx` | `window.DograhWidget` → `window.{{Brand}}Widget`, `dograh-inline-container` CSS id — **breaking change for existing embeds; version the embed snippet and keep the old global as an alias for one release** |
| `ui/src/app/api/auth/{oss,session,logout}/route.ts` | Cookie names `dograh_auth_token`, `dograh_auth_user` → `{{brand}}_auth_token` etc. (rotate all sessions; announce the forced re-login) |
| `ui/src/app/impersonate/route.ts` | Hardcoded `app.dograh.com` / `dograh.com` domain allowlist → new domains |
| `ui/src/app/api/config/latest-version/route.ts` | GHCR image names `dograh-hq/dograh-ui`, `dograh-hq/dograh-api` → `{{GHCR_ORG}}/...` |

Also grep the whole `ui/src` tree for `dograh` after these edits — product copy
is scattered (links to `docs.dograh.com` / `app.dograh.com` appear in many pages).

### 1.2 Docs (`docs/`)

- `docs/docs.json` — `"name": "Dograh AI"` → `{{BRAND}}`; update logo paths,
  favicon, and all links (`docs.dograh.com`, `github.com/dograh-hq`,
  `linkedin.com/company/dograh`).
- `docs/logo/light.svg`, `docs/logo/dark.svg`, `docs/favicon.ico` — replace assets.
- `docs/custom.css` — brand green `#16A34A` hardcoded for search styling → new accent.
- `docs/images/` — screenshots have the old brand baked in; **regenerate all
  screenshots after the UI redesign ships** (Phase 2), otherwise docs and product disagree.
- Grep all `.mdx` files for `dograh` (URLs, env var names, CLI examples).

### 1.3 Backend (`api/`)

- `api/app.py:90-98` — `FastAPI(title="Dograh API", description=...)` and server
  URL `https://app.dograh.com` → new name/domain (this feeds the generated
  OpenAPI spec and both SDKs — regenerate SDKs after, see `scripts/generate_sdk.sh`).
- `api/pyproject.toml` — `name = "dograh-api"` → `{{brand}}-api`.
- `api/.env.example` — `DOGRAH_DEVOPS_SECRET`, `TURN_SECRET=dograh-turn-secret-...`
  → new prefixes. Coordinate with `api/.env` / deployment secrets.
- SDKs: `sdk/python/pyproject.toml` (`dograh-sdk`), `sdk/typescript/package.json`
  (`@dograh/sdk`) → republish under new names; mark old packages deprecated.
- Note: there is **no SMTP code** in `api/` — transactional email comes from
  Stack Auth. Rebrand the email templates in the Stack Auth dashboard (project
  name, sender address, logo), not in this repo.

### 1.4 Infrastructure

- `docker-compose.yaml` — service `dograh-init` / container `dograh_init`, images
  `${REGISTRY:-dograhai}/dograh-api|dograh-ui`, doc links. Rename services and
  default registry. (Compose service renames orphan old containers — document a
  one-time `docker compose down && docker compose up -d` for self-hosters.)
- `nginx/dograh_upstream.conf.template` — filename and `upstream dograh_backend`.
- `deploy/helm/dograh/` — rename the chart directory; `Chart.yaml` (`name`,
  `home`, `sources`, maintainer), `values.yaml`, `values.schema.json`,
  `templates/` image repos and resource names. Helm release names are sticky —
  provide migration notes for existing installs.
- `config/coturn/`, `deploy/templates/`, `deploy/hostinger/` — grep for `dograh`
  hostnames/secrets.
- GitHub: rename org/repos (`dograh-hq/dograh` → new), update git remote,
  GHCR package names, `.github/` workflows that push images.
- Root `README.md` (title `# Dograh AI`, Product Hunt badges), `CHANGELOG.md`,
  `AGENTS.md`, `CLAUDE.md`.

### 1.5 Rename checklist (run before shipping)

1. `rg -i dograh` returns only intentional hits (changelog history, migration notes).
2. App boots with new logos/favicon/title in light and dark mode.
3. Auth flow works with renamed cookies (forced re-login acceptable).
4. Embed widget snippet works; old `window.DograhWidget` alias logs a deprecation warning.
5. `docker compose up` works from a clean checkout with new service names.
6. Helm `template` + `lint` pass with the renamed chart.
7. Generated SDKs import under the new package names.

---

## Phase 2 — Complete UI Redesign, Glassmorphism & Landing Page (DONE)

The rebrand swaps names and logos; this phase replaces the look and feel
entirely — new layout, new design language, and a public marketing site. Stack
facts to design around: Next.js 15 App Router (`ui/src/app/`), React 19,
**Tailwind CSS v4** (CSS-first config — all design tokens live in
`ui/src/app/globals.css`; there is no `tailwind.config.js`), theme colors in
`oklch()`.

Before writing any UI code: read `ui/package.json` and confirm what is already
available (Tailwind v4, icon set such as lucide-react, cmdk, an animation
library). Add only what is missing, matching existing versions and idioms.

### 2.1 Design system foundation (`ui/src/app/globals.css`)

- Define the glassmorphism token set in the `@theme`/`:root` blocks: glass
  surface colors with alpha (e.g. `--glass-bg: oklch(1 0 0 / 0.06)`),
  `--glass-border` (1px, low-alpha white), a backdrop-blur scale
  (`--glass-blur: 16px`), ambient gradient stops in the new brand colors, and
  glow/shadow tokens (`--shadow-glow`).
- Add reusable component classes: `.glass-card` (translucent bg +
  `backdrop-blur` + 1px border + subtle inner highlight), `.glass-panel` for
  sidebars/dialogs, `.glass-button` variants, and a gradient-text utility for
  headlines.
- Typography: load a display font + body font via `next/font` in
  `ui/src/app/layout.tsx` (geometric sans for display, Inter-class for body);
  define a type scale as tokens.
- Dark-first: design the dark theme as the flagship (glass reads best on dark
  with ambient gradients); keep light mode fully supported through the existing
  CSS-variable structure.
- Motion tokens: standard durations/easings (e.g. `--ease-out-expo`) used
  consistently across all components.

### 2.2 New app shell & layout

- Replace the current dashboard chrome: slim collapsible icon **sidebar as a
  glass panel**, top command bar, org/workspace switcher. Behind all glass
  surfaces, render one fixed-position ambient brand gradient mesh in the root
  layout (CSS gradients only — GPU-cheap, no canvas/WebGL).
- **Command palette** (Cmd+K) for jumping between workflows, contacts,
  campaigns — check `ui/package.json` for an existing cmdk dependency first.
- `ui/src/app/overview/page.tsx` becomes a real dashboard: stat cards (calls
  today, active campaigns, pipeline value), recent-activity feed, glass cards
  over the ambient background.
- Update `ui/src/app/layout.tsx` and route-group layouts; keep
  `ui/src/middleware.ts` auth behavior unchanged.

### 2.3 Marketing landing page

The app is currently product-only. Add a public marketing site inside the same
Next.js app:

- Route group `ui/src/app/(marketing)/` with its own minimal layout:
  `page.tsx` (home), `pricing/page.tsx`, `features/page.tsx` (optional). Serve
  the landing page at `/`; product lives under auth-gated routes. Restyle
  `ui/src/app/auth/` pages to match.
- Landing sections, in order: sticky glass navbar → hero (headline with
  gradient text, primary CTA, animated product mockup or live waveform visual)
  → social-proof strip → feature grid (voice agents, campaigns, CRM, analytics
  — glass cards with icon + glow on hover) → "how it works" 3-step →
  CRM/pipeline showcase screenshot → pricing tiers (mirror the Phase 5 plans)
  → FAQ → CTA footer.
- Animation: check `ui/package.json` first; if no animation library exists, add
  `motion` (framer-motion's successor) for scroll-reveal and hero animation,
  respecting `prefers-reduced-motion`. No three.js/WebGL — impressive ≠ heavy;
  keep LCP under 2.5s.
- SEO: per-page `metadata`, OG image (dynamic via
  `ui/src/app/opengraph-image.tsx` or a static asset), `sitemap.ts`/`robots.ts`,
  JSON-LD `SoftwareApplication` schema.
- The landing page is the first thing a buyer sees and the source of truth for
  the new brand — build it before restyling the product interior, and reuse its
  components (glass cards, gradient text, section headings) inside the app.

### 2.4 Restyle the product interior, screen by screen

Each step swaps the screen onto the new shell + glass components — **no logic
changes**. Priority order:

1. Auth pages (`ui/src/app/auth/login/`, `signup/`) — first impression; new
   brand imprint background.
2. Workflow builder (`ui/src/app/workflow/[workflowId]/`) — the flagship
   screen: glass node palette, restyled canvas controls, dialogs
   (`EmbedDialog` etc.) as glass panels. The canvas likely uses a flow library —
   restyle the chrome, do not rebuild the canvas.
3. CRM screens from Phase 4 (contacts, pipeline kanban, contact timeline) —
   build these natively on the new design system; no legacy styling at all.
4. Campaigns, recordings, reports, usage/billing, settings, superadmin.
5. Empty states, skeleton loaders, and toasts everywhere — this is where
   "impressive" is won or lost.

### 2.5 Visual assets

- New OG/social images, favicon suite, and a short looping hero demo clip for
  the landing page.
- Regenerate every product screenshot in `docs/images/` — they must show the
  new UI, not just the new logo.

---

## Phase 3 — CRM Data Model (Backend) (DONE)

All models live in the single file `api/db/models.py`, with per-entity clients in
`api/db/*_client.py` and Alembic migrations in `api/alembic/`. Follow that exact
pattern. Every CRM table is org-scoped (`organization_id` FK + org-scoped
queries via `api/services/organization_context.py`) — multi-tenancy already
exists; do not bypass it.

### 3.1 New models to add in `api/db/models.py`

- **ContactModel** — `id`, `organization_id`, `first_name`, `last_name`,
  `email`, `phone` (E.164, indexed — this is the join key for inbound/outbound
  calls), `company_id` (FK, nullable), `source` (manual / csv / call / api /
  integration), `lifecycle_stage` (lead / mql / sql / opportunity / customer),
  `owner_id` (FK to `UserModel`), `custom_fields` (JSONB), `do_not_call` (bool —
  required for compliance), `consent_at`/`consent_source` (call-recording and
  outbound-dialing consent), timestamps, soft-delete.
- **CompanyModel** — `id`, `organization_id`, `name`, `domain`, `industry`,
  `size`, `owner_id`, `custom_fields` (JSONB).
- **DealModel** — `id`, `organization_id`, `contact_id`, `company_id`, `title`,
  `value` (numeric), `currency`, `pipeline` (string or FK to PipelineModel if
  you want multiple pipelines), `stage`, `probability`, `expected_close_date`,
  `owner_id`, `status` (open / won / lost), `lost_reason`.
- **ActivityModel** — timeline entries: `id`, `organization_id`, `contact_id`,
  `deal_id` (nullable), `type` (`call`, `note`, `email`, `meeting`, `task`,
  `stage_change`), `body`, `workflow_run_id` (FK, nullable — **the critical
  link**: every voice call auto-creates an activity), `created_by`, `due_at`
  (for tasks), `completed_at`.
- **TagModel + contact_tags association** — for segmentation and campaign targeting.
- **ListModel / SegmentModel** (optional v1.5) — saved filters for campaign audiences.

Add DB clients: `api/db/contact_client.py`, `company_client.py`, `deal_client.py`,
`activity_client.py` — mirror the style of `api/db/campaign_client.py`.

### 3.2 Integrate with what already exists

- **Campaigns**: today `CampaignModel` leads ride on campaign rows/CSV
  (`api/services/campaign/`). Refactor campaign audiences to reference
  `ContactModel` (a campaign = a query over contacts/lists), while keeping CSV
  upload as an import path that *creates contacts first*. Respect
  `do_not_call` in `api/tasks/campaign_tasks.py` before dialing.
- **Calls → timeline**: in `api/tasks/workflow_completion.py` (post-run
  finalization), upsert a contact by phone number and create a `call` activity
  with recording link (`WorkflowRecordingModel`), transcript summary, duration,
  and disposition. Optionally extract structured fields (interest level, callback
  request) via the agent's summary and write them to `custom_fields`.
- **In-agent CRM tools**: add CRM actions to the agent tool system
  (`api/db/models.py` `ToolModel`, `api/routes/tool.py`, node types in
  `api/routes/node_types.py`): `lookup_contact`, `create_contact`,
  `update_deal_stage`, `book_callback` (creates a task activity). This is what
  turns "voice agent" into "voice agent that updates your CRM mid-call."

### 3.3 API routes

New modules under `api/routes/` (register in `api/routes/main.py`):

- `contacts.py` — CRUD, bulk CSV import/export, merge/dedupe by phone/email,
  search with filters (tag, stage, owner).
- `companies.py` — CRUD.
- `deals.py` — CRUD + pipeline board endpoint (deals grouped by stage).
- `activities.py` — timeline per contact, task creation/completion.
- Pydantic schemas in `api/schemas/` alongside the existing ones.

### 3.4 Background jobs (`api/tasks/`)

- `contact_import_tasks.py` — chunked CSV import via ARQ (register in
  `function_names.py` / `arq.py`).
- Extend `webhook_delivery.py` events: emit `contact.created`, `deal.stage_changed`,
  `call.completed` so external CRMs can subscribe.
- `run_integrations.py` — add HubSpot/Salesforce sync workers here later
  (two-way contact sync); design `ExternalCredentialModel` usage for OAuth tokens.

---

## Phase 4 — CRM Frontend (`ui/src/app/`)

Match the existing section pattern (`campaigns/`, `reports/`): a route folder
with list page + detail page, wired into the dashboard nav. Build all of these
on the Phase 2 design system from day one.

- `ui/src/app/contacts/page.tsx` — table with search, filters (stage, tag,
  owner), bulk actions, CSV import dialog, "add contact" drawer.
- `ui/src/app/contacts/[contactId]/page.tsx` — profile header, **activity
  timeline** (calls with recording playback — reuse the recordings UI from
  `ui/src/app/recordings/`), notes, tasks, deals, custom fields.
- `ui/src/app/companies/` — list + detail (contacts roll up here).
- `ui/src/app/pipeline/page.tsx` — kanban board of deals by stage
  (drag-and-drop updates `stage` via the deals API).
- `ui/src/app/tasks/page.tsx` — task list (from open `task` activities), due-date
  sorting, per-owner filter.
- Workflow builder: add the new CRM tool nodes to the palette so users can drop
  "Update deal stage" / "Lookup caller" into a call flow visually.
- Campaign creation UI: replace bare CSV upload with "choose list/segment or
  upload CSV (creates contacts)".

---

## Phase 5 — SaaS Commercialization (Billing)

Current state: internal usage metering exists (`api/services/mps_billing.py`,
`workflow_run_billing.py`, `quota_service.py`,
`api/db/organization_usage_client.py`, `ui/src/app/billing/page.tsx`,
`ui/src/app/usage/page.tsx`). **No payment provider exists** — this is net-new.

1. **Stripe integration (backend)**
   - New models: `SubscriptionModel` (org_id, stripe_customer_id,
     stripe_subscription_id, plan, status, seats, current_period_end) and
     `InvoiceModel` (or rely on Stripe invoices + link out).
   - New route `api/routes/billing.py`: create checkout session, customer portal
     session, and the **Stripe webhook receiver** (verify signatures; handle
     `customer.subscription.updated/deleted`, `invoice.payment_failed`).
   - Store Stripe keys in env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`),
     never in the DB.
2. **Plan enforcement**: extend `quota_service.py` so plan limits (voice minutes,
   tokens, seats, phone numbers, CRM contact count) gate usage; map
   `OrganizationUsageCycleModel` overage to Stripe metered billing if you want
   usage-based pricing on top of the base plan.
3. **Seats**: enforce per-plan seat counts on org member invites (organization
   service + Stack Auth team membership).
4. **Billing UI**: rework `ui/src/app/billing/page.tsx` — plan cards, checkout
   redirect, manage-subscription portal link, invoice history, usage-vs-limit
   meters (feed from existing `usage` page data).
5. **Paywall states**: graceful degradation when a subscription lapses — block
   new outbound campaigns and new runs, keep inbound + data read-only. Never
   delete CRM data on churn; that's the moat.
6. **Trials**: 14-day trial via Stripe `trial_period_days`; dunning emails via
   Stripe's built-in emails first (don't build email infra yet — there is no
   SMTP layer in `api/` today).

---

## Phase 6 — "Million-Dollar SaaS" Essentials

The unglamorous features that decide whether businesses can actually buy this:

- **Compliance for voice**: TTS/recording consent disclosures, `do_not_call`
  enforcement (Phase 3), call-recording retention controls per org
  (`OrganizationConfigurationModel`), data-deletion endpoint per contact (GDPR
  right-to-erasure cascading across contacts, activities, recordings in S3/MinIO).
- **Onboarding flow**: post-signup wizard (create first agent from
  `WorkflowTemplates`, import contacts CSV, buy/configure a phone number via the
  existing telephony routes) — activation is the whole game.
- **Analytics**: extend `api/routes/reports.py` with CRM-aware dashboards —
  calls per contact stage, conversion rate by campaign, agent performance,
  revenue influenced (sum of won deal value touched by calls).
- **Audit log**: who changed what on contacts/deals (append-only table;
  enterprise buyers ask for this).
- **RBAC**: roles beyond owner (admin / agent / read-only) enforced in
  `api/services/auth/depends.py` and surfaced in org settings.
- **Public API parity**: expose the CRM endpoints in the OpenAPI spec and
  regenerate both SDKs (`scripts/generate_sdk.sh`, `sdk/python`, `sdk/typescript`)
  — the API is a sales channel.
- **Docs**: new docs sections for CRM concepts, billing, embed widget (new
  snippet name), and a migration guide from the old brand.

---

## Phase 7 — Execution Order & Rollout

1. **Rebrand (Phase 1)** on a `rebrand` branch; ship first — it's mechanical and
   touches everything, so landing it before feature work avoids endless conflicts.
2. **Design system + landing page (Phases 2.1–2.3)** — tokens, app shell, and
   the public marketing site; this locks the visual identity before new screens
   are built on top of it.
3. **CRM backend (Phase 3)** behind a per-org feature flag
   (`OrganizationConfigurationModel`), so OSS users are unaffected.
4. **CRM frontend (Phase 4)** gated by the same flag, built natively on the new
   design system.
5. **Interior restyle (Phase 2.4)** screen by screen, in the priority order listed.
6. **Billing (Phase 5)** in staging with Stripe test mode; rehearse webhook
   handling and lapsed-subscription behavior before enabling in prod.
7. **Migration day**: new container images under `{{GHCR_ORG}}`, DB migrations
   via Alembic, cookie rotation (forced re-login), domain cutover with redirects
   from `*.dograh.com`, deprecation notice on old SDK packages.
8. **Launch essentials**: status page, pricing page live, regenerated docs
   screenshots (new UI), changelog entry, announcement to existing self-host
   users that the OSS path (`docker-compose.yaml`, no-auth mode) remains fully
   supported.

## What NOT to do

- Don't fork SaaS vs. OSS into separate codebases — one image, config-gated.
- Don't build SMTP/email infra yet — use Stack Auth templates and Stripe emails.
- Don't break the embed widget global without an alias period.
- Don't skip the `do_not_call`/consent fields — outbound voice without them is a
  legal liability, not a feature.
- Don't add heavy WebGL/3D to the landing page — glassmorphism + good motion is
  the wow factor; a slow hero kills conversions.
- Don't restyle screens with logic changes mixed in — visual-only PRs per screen.
- Don't let the rebrand and CRM schema land in one giant PR — separate the
  mechanical rename from the semantic changes so both stay reviewable.
