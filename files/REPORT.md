# Assisted stage rehearsal plan and consent checklist

Planning result for pr, 2026-11-13 UTC. **Planning complete; rehearsal NOT RUN.** No provider/runtime/SQL/DNS/flags/secrets/consent/account changes, product modifications, product commits, product pushes, PRs, deploys or CI dispatches were performed. Only the separately authorized report-only evidence refs may be published. This report is suitable for PR/BZ review; the local feeder alone applies plan text.

First estimate: **1–2 run-hours for planning**, report by **14 Nov 06Z**. Earliest rehearsal **14 Nov 08–12Z**, conditional on HH114/install4, reviewed working path and existing no-new-charge stage coverage. Target completion **before 17 Nov 00Z**. Source inspection exposes blockers below; there is no unconditional rehearsal start date. HH0425/install4 Managed stand-in and Lamp P2 remain first.

## Source identity and limits

Read main using disposable `--depth 1 --filter=blob:none` clones, immediately setting local fleet identity. Inspected:

- [platform main 86030a5c51a7774132693e8715da2a22e3676b56](https://github.com/runeditrun/platform/tree/86030a5c51a7774132693e8715da2a22e3676b56).
- [delivery main f50b72a5fdaaed2fac2fc615716b3f1d3c62b47a](https://github.com/runeditrun/delivery/tree/f50b72a5fdaaed2fac2fc615716b3f1d3c62b47a).

`SOURCE-INDEX.json` records 64 exact files with immutable URLs, byte lengths and SHA-256. `PLANNING-RECEIPT.json` records actual inspection and clean-product checks. Repository source/config is not proof of live deployment. No test suite was run, dependencies installed or secret setup executed; existing tests were inspected. The launcher's mandatory refresh/Git transport bootstrap is separate from product key setup. Delivery has no root/nested AGENTS.md in the inspected checkout; platform AGENTS.md and launcher AGENTS.md were read. The supplied LANE-RULES.md, briefs/RULES.md and PLATFORM-LANDING-POLICY.md were read as context. The cloud read-only return contract overrides their product-build/READY/local-plan-edit instructions. No held-out rubric was read.

The shared CHARGEDESK-PLATFORM-PLAN.md, lane inbox, runtime IDs and other lanes' private work trees are unavailable here. `STEP7.md` is standalone replacement text for the feeder, not an edit. `VIEWER.md` is the full dated credential proposal. The final message relays the report to the terminal inbox. Planning queue is empty: no successor launch is authorized.

## Binding direction

Owner at 13 Nov 23:28Z chose **Assisted**: Business at runeditrun.com installs HappyToHelp and Lamp into the owner's Cloudflare account holding chargedesk.com and **ChargeDesk GitHub organisation**. Consent is the owner's own action. Business writes no DNS. No ChargeDesk Stripe touch. No fallback to Managed without the owner's word. Stage uses only RunEditRun account `b20c0ca9cab0c2b70e13d7cf724b89bd` and an existing stand-in Business; no new accounts/spend, app.happytohelp.com or JustEvery account. The eventual owner-account checklist below is descriptive; this planner requests no consent.

## What actually exists

Platform `src/accounts/oauth.ts:28–30,55–76` implements `/api/auth/:provider/start` and `/callback`, Cloudflare authorization code with S256 PKCE, a ten-minute state/cookie, one-time redemption, current signed-in user binding and server-side `client_secret_post` exchange. Cloudflare endpoints are `https://dash.cloudflare.com/oauth2/auth` and `/oauth2/token`. Callback is `${APP_URL}/api/auth/cloudflare/callback`; stage APP_URL is `https://billing-qualification.runeditrun.com`, production console is `https://app.runeditrun.com`. Marketing runeditrun.com is not the stage origin.

Intended stage scopes in `docs/runbooks/tools/ops/targets.json:53`, checked by `docs/runbooks/tools/config-doctor/cloudflare-oauth.mjs:4,90–107`, are exactly:

```
account-settings.read workers-scripts.write d1.write workers-r2.write queues.write zone.read offline_access
```

`cloudflareScopes` always adds `zone.read offline_access`, deduplicates and removes `dns.write`, even from legacy bindings. Account settings permit account discovery; resource write scopes support assigned Workers/D1/R2/Queues; zone read supports domain evidence; offline access permits refresh. These are **write-capable, account authorization scopes**, not a per-installation read-only grant. No token-paste customer onboarding route was found in `src/accounts/routes.ts`/oauth handlers. Managed API-token configuration and the config doctor are operator paths, not an Assisted workaround. Do not mint or request a token here.

`src/components/business/hosting.tsx:35–68` provides Connect Cloudflare, account selection and Check again. Public doors: `GET /api/accounts`, `GET /api/accounts/cloudflare/accounts`, `GET /api/business/:businessId/preflight`; same-origin `POST /api/business/:businessId/preflight` with `{"account_id":"<chosen-id>"}` saves the choice, while `{}` only rechecks. Only the Business creator may choose; apps already placed elsewhere prevent account splitting (`src/business/preflight.ts:127–155`). Checks are read-only to Cloudflare, although token refresh and platform receipt/state writes can occur. They do not enable services, change plans or write DNS.

### Exact Cloudflare consent review

Open Connect Cloudflare from `/business/:businessId/settings/hosting`; do not construct a guessed OAuth client ID. [Cloudflare's consent documentation](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/) describes the application branding, publisher domain/verification, account selector, requested permission list and Authorize button. The owner selects only the intended account and reviews the exact seven requested scopes above. Optional controls appear only when registered. Reject unexpected DNS-write or other surplus requests. The actual app name/logo/client ID and live screen were not observed; capture them at preflight rather than inventing a screenshot or claiming exact current provider wording. Expected publisher is Run Edit Run/runeditrun.com, subject to live identity verification.

Registration must be public/eligible for outside account members, have the exact callback, mandatory resource scopes and authorization-code/refresh grants. Private clients are restricted to parent-account members; [client documentation](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/) and the config doctor supply the review path. ACCEPTANCE.md's earlier public-client success is historical evidence, not today's readback. A different production console needs its own registered callback; no callback registration changes are made here.

### GitHub consent and the organisation blocker

GitHub sign-in asks `read:user user:email` at `/api/auth/github/start`; that identifies the person and does **not** install repository authority. The configured App install route is `GET /api/delivery/github-app/install?installation=:id`, authenticated owner only, redirecting to `https://github.com/apps/<configured-slug>/installations/new`. Its 30-minute one-time state returns through the App Setup URL and `POST /api/delivery/github-app/return` (`onboarding-account-routes.ts:29–49`). `GITHUB_APP_SLUG` is a runtime secret binding, not a literal in tracked vars (`github-app-slug.ts:3–13`); no exact slug or live App identity is claimed.

Source registration and doctor require repository **Contents, Pull requests, Actions, Administration, Workflows, Checks and Deployments: write**, **Metadata: read**; events push, pull_request, workflow_run. See `scripts/admin/github-app-setup.mjs:34–35`, `config-doctor/github.mjs:12,105–107`. Confirm actual App identity, publisher and all granted permissions before owner installation. Use the **ChargeDesk organisation**, never an assumed personal account. Administration means an organisation owner is the appropriate installer; [GitHub installation guidance](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party) distinguishes owner installation and selected repository access. Avoid All repositories unless required and explicitly accepted: a future repository must be included in the installation before its write token can access it. An existing publisher installation is separate authority, not a ChargeDesk installation.

**Blocking source fact:** `src/business/provisioning/context.ts:32–41` calls `/user`, then takes an App installation only when `item.account.id === user.id`, returning `owner:user.login`. It neither selects the ChargeDesk organisation nor persists its target. Therefore current Business auto-provisioning does not execute the owner's requested organisation path. The standalone app flow lists installations and the lower-level bootstrap handles User/Organization (`repository-bootstrap.ts:228–251`), but neither proves the Business organisation path works. Do not substitute personal hosting or manual SQL. A stage personal-account smoke can isolate existing behavior but cannot qualify this owner requirement. A representative organisation stand-in cycle waits for the gap to be reviewed/fixed.

Smallest durable delta: explicit owner-chosen GitHub installation/organisation target saved on the Business, verify exact configured App ID/current authority and owner/repository rights, propagate it into provisioning and checkpoint identity, refuse revoked/suspended/foreign targets and target changes after copying begins, preserve current personal-account behavior. Reuse lower-level bootstrap rather than duplicate copy logic. Handle installation-list pagination for valid later-page targets. Scope: additive migration after current 147, Business selection/API/context and focused public-door tests; **4–6 builder run-hours + 1–2 independent auth gate run-hours**, not implemented. A one-line account filter relaxation would choose arbitrary authority and is insufficient.

## Credential custody and limitations

Assets/source stay in customer provider accounts; applications operate independently of management after disconnect. **RER still holds delegated credentials**. `src/accounts/credentials.ts:9–31`, `src/platform/crypto.ts` and OPERATIONS.md:232–234 store access/refresh tokens encrypted using AES-GCM bound to user/provider, server-side; session/widget secrets are hashed. Refresh is compare-and-swap guarded against replacement/revocation. App private-key/token handling and trusted deployment remain outside editable customer build code; delivery's build/attestation jobs separate candidate execution from OIDC and production secrets.

No owner password, browser profile, provider token or session is delivered to the fleet/report. Evidence contains only public-safe metadata, not OAuth codes/state cookies, refresh tokens, HARs, auth files, environment dumps, raw private configuration, exports or private gate material. Delegated access may span all granted resources in the selected account; ownership is not least-privilege isolation or absence of credential custody. `DELETE /api/accounts/:provider` disables local authority first, then revokes upstream; failed revocation remains locally disconnected with encrypted material retained for retry (`accounts/routes.ts:15–31`, `revoke.ts`). Disconnecting a shared owner's provider affects other installations; check before doing it. Existing legacy DNS-write grants are not proven narrowed just because new consent omits that scope.

## Read-only Workers Paid check and pricing facts

After consent/account selection, record four Business checks (`business/preflight.ts:19,74–95`): workers.dev, collision inventory, Workers Paid and R2, each with checked_at/account/status/reason. The eight-second deadline yields unknown/retryable; never accept an unknown as paid/ready. R2 uses GET buckets, workers.dev GET subdomain; missing subdomain may be `will_create` on first release. Collision checks read actual planned Workers/D1/R2/Queues/KV and refuse adoption of unowned existing names. No planned names yet is not proof later names are clear; rerun after planning.

**Workers Paid inference is incorrect today:** `src/delivery/cloudflare-preflight.ts:46–67` turns successful `GET /accounts/:id/queues?per_page=1` into “Workers Paid is on.” [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) now documents Free and Paid. Listing Queues proves API access, not the paid subscription; 402/403 can also be a scope/access problem. Keep this as an identified existing gap, not a provider receipt.

A future authorised read must inspect **GET `/accounts/:id/subscriptions`**, accepted **Billing Read** permission per [Cloudflare API](https://developers.cloudflare.com/api/go/resources/accounts/subresources/subscriptions/methods/get/), or the owner's read-only Workers & Pages → Plans screen. Record actual subscription/rate-plan identity, account scope, status, period, currency/price and observation time; resolve actual provider identifiers against [subscription reference](https://developers.cloudflare.com/tenant/reference/subscriptions/). `WORKERS_PAID` is a documented example, not evidence this account has it. Today's requested OAuth scope set does not prove Billing Read access. On refusal retain unknown and use an owner-visible read; do not add a guessed billing OAuth scope or mint a token. No upgrade, enable-R2 click, subscription mutation or payment is authorized. No actual account-plan read was made.

Smallest code correction: separate capability/Queues evidence from plan evidence; a successful queue read cannot label paid. Provide authoritative plan read when its supported permission exists, otherwise unknown plus dashboard link. Extend Business/public-door provider-edge cases for Free-with-Queues, paid, missing scope, expired grant and unknown. **2–3 builder run-hours + 1 independent gate run-hour**, separate from org selection and not implemented.

Pricing distinctions, not a purchase proposal:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) documents a **US$5/account/month minimum** plus usage, including 10M requests and 30M CPU-ms; this is not evidence of a US$10 Cloudflare plan. Paid raises execution/usage allowances; actual spend depends on usage and separate services. No live subscription/invoice was read.
- [Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/) supports arbitrary-recipient sending on Paid, currently 3,000/month included then $0.35/1,000; verified-destination sends are free on either plan. This does not prove an installed app's sender/domain is configured. Business must not write DNS to make it so.
- `src/billing/plans.ts:7–18` defines **individual Assisted $10/month with $5 management AI credit**: customer GitHub/Cloudflare ownership, managed-change allowance, source/delivery/review/preview and leave/export guarantees. This does not buy Cloudflare usage, guarantee every feature works or permit paid AI calls now.
- The same main defines **Business $100 per approved app/month regardless of hosting**, using the configured Managed Price, not the individual $10 Assisted Price. Thus HH + Lamp newly charged by Business imply **$200/month product fees**, subject to actual price verification and existing coverage. `businessCreditGrantMicrousd` grants $5 per Assisted paid app up to five allowance units: two would mean $10/month pooled AI allowance, **not a $10 subscription**. Do not advertise or consent on historical ACCEPTANCE.md prices alone. No ChargeDesk Stripe read/write and no price decision were made; strategy must resolve any intended different commercial promise.

## Owner actions, minutes and preflight route

Future owner checklist only; no fleet consent request. Times are active minutes, not measurements, excluding MFA/provider waits:

| Owner action | Minutes | Route/check |
|---|---:|---|
| Sign in to intended Business; confirm Assisted/HH/Lamp | 2–3 | Console Business page/plan, exact Business ID |
| Review Cloudflare app/publisher and choose only account holding chargedesk.com | 3–5 | Hosting → Connect Cloudflare → Cloudflare consent |
| Review exact scopes, confirm no dns.write | 2–3 | Provider consent before Authorize |
| Return and explicitly choose that account | 1–2 | `/business/:id/settings/hosting` → Use this account |
| GitHub sign-in + App install on ChargeDesk organisation, after org blocker resolves | 4–6 | Separate OAuth and App install; review repo scope/permissions |
| Review preflight and actual paid-plan observation | 2–3 | Hosting checks; read-only Plans screen if billing API unavailable |
| Review HH/Lamp exact sources, targets and setup plan | 3–5 | Business plan review; no checkout/spend here |
| Native owner claim/setup for each app | 3–5 each | App's manifest-declared owner setup door, not platform health |

Total **23–37 active owner minutes**. Stage uses a pre-existing approved RunEditRun stand-in owner, never owner impersonation or transplanted browser sessions. If stage consent is missing, stop before provider authorization; strategy controls any separate request. Permissions and app branding are verified before the consent checklist is relayed. No Managed fallback.

## Executable rehearsal sequence for a later authorized run

**Entry fence:** HH0425/install4 Managed stand-in and Lamp P2 first; HH114/install4 result and reviewed working path required. Capture receipts instead of inferring completion from a nickname. `23475464` and `install4` were supplied, not found/validated in source; resolve their immutable IDs, roles, environment and ownership. Existing stage entitlement must cover both apps with no new checkout, upgrade, account or hosted AI call. Existing provider/Actions free or included allowances must be confirmed sufficient; zero new spend cannot be presumed from a test flag. Without coverage, record external blocker and stop. Do not synthesize entitlements with SQL, flags or secret setup.

1. Read stage `/api/version`, `/health`, `/api/session` and approved Business/installation IDs under a legitimate existing owner session. Retain only version/source and authenticated actor ID, never session material. Reconcile source SHA, applied migration/controller receipt and trust policy from the approved stage operator receipt; `/health` alone proves HTTP only. No live probes were made in this planner.
2. Read `GET /api/business/:id`, `/plans`, `/apps`, `/preflight`; obtain provider account choices from `/api/accounts/cloudflare/accounts`, GitHub installations from `/api/delivery/github-installations`. Resolve exact RunEditRun account and reviewed GitHub target, sources/pins and existing coverage before any provider write. Source-intended stage pins are HH **v0.4.25 / 333af4b0580c4284616783f1d79fcc9aad3aefc5**, Lamp **v1.11.14 / 733e2ce1e2fc618183a93632218bb86456a06a79**, from ops targets; re-read at execution. Do not equate HH114 with a source pin without its receipt.
3. Compare actual runtime trust with intended configuration: ops stage trusts delivery **f50b72a5...**, while tracked wrangler stage currently names **34cf6c23...**. An intended override is not proof it was applied. No repin/deploy is authorized here. Delivery README's statement that platform only accepts schema 1/2 is stale relative to actual platform `artifact-package.ts:362,437–450`, which validates schema 3 and retains old formats. Verify the deployed consumer matches; never weaken provenance or set promotion eligible (delivery BUILD-INPUTS.md).
4. Review/approve an existing stand-in Business plan containing only HH/Lamp through `POST /api/business/:id/plans/:planId/approve`, using current revision/current owner. Observe `/api/business/:id/apps` as normal scheduler advances copy/configuration/build/claim. Business may publish its approved first release automatically; approval is consequential and must remain in the later rehearsal's scope. A representative org-target cycle waits for the org fix. Never bypass it through a sibling lane's database.
5. **Cycle 1, each app:** first source copy, existing configured native setup/owner claim, accepted build and first stage-hosted production-environment publication. “Production” here means the stand-in app's delivery environment, never the ChargeDesk live environment. Capture Business task/app result, actual customer repo ID/owner/App installation, source upstream pin and projected install commit/tree, reusable workflow SHA/run/attempt/profile, receipt/archive/artifact/plan digests, accepted actor, deployment and active Worker version, then manifest-declared health and normal native owner door. Observe correct first-run/needs-owner states, and cross-installation/unsigned read refusals without another customer's data. The platform's `/apps/:id` and `/api/installations/:id` are the status doors.
6. **Cycle 2, each app:** one reviewed deterministic non-AI source update in the throwaway customer repo, normal trusted build, exact release review/accept/publish and public readback. Use `GET /api/delivery/installations/:id/head` and `/releases`, `POST .../releases/:releaseId/accept` with actual `identityDigest`, then `/publish` as required by the existing owner flow; never replay a guessed digest or broaden acceptance. Retain before/after source/artifact/runtime identities and data continuity. Observe retry/reconnect handling if a real bounded failure occurs; do not revoke shared grants or inject provider mutations just to manufacture a failure. No claim that an unexercised failure passed.
7. Snapshot ordinary owner pages at 1440 and 390 and app-native public behavior for both cycles; redact before publishing. Retain dates from `date -u`, exact URLs/status, action and readback times, checked-at values, named actor/installation/environment and limitations. First consent, authenticated config, trusted build, accepted release, running version, native owner proof and application behavior are separate receipt facts.
8. Exit using the scoped cleanup below. A second fresh-install pair is optional only if the first pair's actual failure makes it necessary; minimum is **two end-to-end cycles per app (four app cycles)**, not a demand for repeated installs/charges.

Existing helper `scripts/qualification/assisted-qualification.mjs:20–28,125–166` restricts stage host, supports read-only mode, and requires `RER_ASSISTED_APPLY=1` plus `RER_ASSISTED_CONFIRM=RUNEDITRUN_ASSISTED_OWNER_PILOT` for mutation. Future use must set its evidence dir explicitly, `RER_ASSISTED_UPDATE=1`, `RER_ASSISTED_REQUIRE_UPDATE=1`, and exact expected customer commit for update proof. Its actual receipt is `assisted-qualification.json`; it can inspect an existing installation/update/export, but **does not create/qualify the Business owner consent flow**. Its flags are not owner authorization. Auth files/session/storage state and export ZIPs stay private; do not run it here or copy an existing browser profile. Existing tests and helper are context, not proof of rehearsal execution.

### Receipts and cleanup

Later run receipt set: preflight/consent metadata (no codes/tokens); per-app first-install and update release identities; GitHub run/attempt/workflow provenance; actual public health/native-owner observations; redacted browser observations; preservation/export summary; cleanup/revoke inventory and unresolved items. A report-only public packet must omit raw exports/configuration and any fixture/private customer data. Hash and store original private exports only in approved private custody, publishing a safe summary.

Use `GET /api/delivery/installations/:id/hosting` to inventory current customer custody. `GET .../releases/:releaseId/export` supplies export metadata; `/export/application` can generate private retained data and is **not a pure read**. Execute only under later rehearsal authorization and keep its bytes private. `POST /api/delivery/installations/:id/disconnect` ordinarily preserves Assisted source and Cloudflare resources; read back lifecycle and native app availability. No destructive cleanup of `23475464` or existing install4 is implied. Use a separate disposable installation for an authorized Leave rehearsal.

Deletion is a distinct explicit `removeCloudflareResources:true` choice. If later approved for throwaway stand-in resources, use that existing route/removal state, scope to recorded resources in both environments, require absence readback and retain exact remaining resource names on partial failure (`tests/delivery-assisted-leave.test.ts`). Do not delete by name prefix or touch shared repositories/account services. If cleanup authorization only permits preservation, retain an owned residual inventory/cost note; do not claim zero leftovers. Revoke only dedicated consent/App scope after confirming no other stand-in apps use it. No DNS change, global uninstall or subscription cancellation is implied.

## Work budget, blockers, and existing tests

Rehearsal after prerequisites: **4–6 operator/builder run-hours + 1–2 independent review run-hours**, with provider waits/owner availability additional. Two app first publications (about 1–1.5h), two reviewed updates (1–1.5h), preflight/consent/identity (0.5–1h), native doors/receipts/cleanup (1–2h). Estimates overlap; use total 4–6 rather than adding every upper bound. Org fix and Paid-check correction add **6–9 builder + 2–3 gate run-hours** if both commissioned; viewer work adds its own 3–5 + 1–2 and is not required for rehearsal. No work was implemented or launched.

Blockers, in decision order:

1. HH0425/install4, Lamp P2 and HH114/install4 actual receipts and reviewed working path unavailable here; remain external prerequisites, do not infer completion.
2. Business lacks explicit organisation target, preventing the eventual ChargeDesk org path. Reviewed fix above; no personal-account fallback.
3. Current Queues-based paid label cannot certify Workers Paid. Use authoritative read-only plan evidence; correct code separately.
4. Stage runtime SHA/trust/deployed consumer and current intended pins/entitlement/allowance not read. Require existing operator receipts/authorized preflight, no deploy or spend in this planner.
5. Commercial mismatch: current Business price differs from individual Assisted $10. Strategy resolves intended promise before any owner payment action; no price changes or ChargeDesk Stripe access.
6. Exact live App/client branding/permissions/callbacks and organisation repository selection not read; owner-consent screen review remains future evidence.

Inspected test evidence map (not executed):

| Concern | Existing test/source |
|---|---|
| Current one-time CF state, PKCE exchange, legacy dns.write omission | `tests/core/cloudflare-consent.test.ts:10` |
| Owner/account/R2/Queues/workers.dev/collision checks | `tests/core/business-preflight.test.ts:40`; important Paid inference fixture does not establish live subscription truth |
| Checkout owner/account readiness | `tests/core/assisted-checkout-gate.test.ts:74` |
| Configured App owner/state round trip | `tests/core/github-app-entrypoints.test.ts:36`, `github-app-install.test.ts:31,56` |
| Business provisioning, retry/custody/native owner and app adoption | `tests/core/business-provisioning.test.ts`, `business-installations.test.ts`; personal-account fixture is not org proof |
| Membership, widget scope/expiry, pending verified identity | `tests/core/auth.test.ts`, `widget-expiry.test.ts`, `pending-membership.test.ts` |
| Broker/provenance, immutable receipt validation | `tests/delivery-broker-provenance.test.ts`; `src/delivery/artifact-package.ts:362,437` |
| Preserve/default and explicitly opted removal/partial failure/readback | `tests/delivery-assisted-leave.test.ts:13,32,79,142,157` |
| Isolated attestation, source/runtime binding, bounded prepare retry | delivery `tests/trusted-build.test.mjs:70,76,91,171`; `tests/build-inputs.test.mjs:13,49,57` |

[PR397](https://github.com/runeditrun/platform/pull/397) was observed **open, unmerged**, head `3eb2bb6f8410f4bf3b00a61d4855b15d777185ef`. Its accepted source/artifact/Worker provenance must remain with that writer. The event-actors writer is also reserved by the brief; no matching current PR title/source marker identified its exact head, so none is invented. Rehearsal consumes their reviewed output when available, or reports provenance/actor facts unknown. No duplicate work or launch.

## Viewer decision and return

`VIEWER.md` gives the full proposal for scoreboard installation `23475464` and future install4. Existing **human viewer membership** exists (`auth.ts:68`, `installations/routes.ts:88`), but no durable read-only installation scoreboard bearer. Widget/editor and five-minute smoke tokens are unsuitable. Proposed smallest capability: opaque 256-bit bearer, hash-only durable record, one installation/origin and fixed `scoreboard:read` projection, seven-day default/thirty-day maximum, owner-only issue/revoke, immediate authority/lifecycle checks, no mutation or other private GETs, raw token stored only in approved consumer secret storage and kept out of browser bundles/logs/evidence. This is a **separate 3–5 builder + 1–2 auth gate run-hour proposal**, not implemented and nothing minted. Strategy review first; PR397 and event-actors remain the source for those projections.

Actual packet: `$HOME/rer-consolidation/work/pr-assisted-stage-plan-1/packet/REPORT.md`, `STEP7.md`, `VIEWER.md`, `PLANNING-RECEIPT.json`, `SOURCE-INDEX.json`. Convenience report copies live at `work/pr-assisted-stage-plan-1/{REPORT,STEP7,VIEWER}.md`. Evidence transfer output is retained separately to avoid self-referential receipt hashes. Publishing reports is not product acceptance, readiness or landing. Product clones remain unchanged through publication and are deleted after transfer as requested. No shared lane file is edited.

POST lanes/pr/INBOX.md: 2026-11-13 pr pr-assisted-stage-plan-1: planning complete; Assisted rehearsal not run. Main refs platform 86030a5c/delivery f50b72a5. Proposed STEP7 and viewer proposal in returned packet. Business auto-provisioning selects personal GitHub only; Queues read cannot prove Workers Paid; Business price is $100/app, not individual Assisted $10. Keep HH0425/install4 Managed and Lamp P2 first; earliest 14Nov08–12Z conditional on HH114/install4 and reviewed path, target before17Nov00Z. Default: PR/BZ review these bounded gaps and local feeder applies STEP7; no owner consent, token mint or successor launch now.

```queue-entries
[]
```
