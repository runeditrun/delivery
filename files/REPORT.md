# Delivery artifact metadata retry — fv-delivery-artifact-metadata-retry-1

Product repository: runeditrun/delivery.
Product branch: cloud/fv-delivery-artifact-metadata-retry-1.
Exact workflow commit: 780a3ca169bcce9599e487c02592a31103734740.
Base: ff70d729948753ffdcceeca94aad063af2dcd979 (current main at clone and both subsequent fetches).
Draft PR: https://github.com/runeditrun/delivery/pull/11.
Exact-head Verify: run 42668913217, completed/success, https://github.com/runeditrun/delivery/actions/runs/42668913217.

## Plan and scope completed

Read the launcher rules and repository documentation; this repository has no AGENTS.md, CONTRACT.md, ACCEPTANCE.md or clause generator. Established the existing suite baseline. Updated only the post-upload metadata validation in `.github/workflows/trusted-build.yml` and added one focused 107-line file, `tests/artifact-metadata.test.mjs`, using the existing extraction helper. Ran the inline validation program through Node with only GitHub fetch replaced and time advanced in tests. Ran the existing suite, reviewed the diff, kept fleet hooks active, committed as Run Edit Run fleet, inspected all candidate commit identities and messages, and pushed the named product branch through the supplied cloud push guard on its first attempt. Created the requested draft PR through REST and observed exact-SHA successful Verify through REST. Re-fetched main after publication; it remained the candidate's parent, so no merge or replay was necessary. Product working tree is clean and `git ls-remote` independently confirms the published product SHA. The complete initial plan is in PLAN.md.

The product commit contains exactly the workflow change and the focused test file. Report/receipt files stay outside the product tree and are transferred only through the separate evidence ref. No other repository, provider, deployment, customer workflow pin or rollout was changed. Mac publication scanning, landing and pin adoption remain with the fleet/owning lanes.

## Evidence and chosen retry budget

The brief reports two valid **3,069,901-byte** archives against an unchanged **67,108,864-byte (64 MiB)** limit. Their metadata reads returned 404 **0.26–0.29 seconds** after upload finalization; a passing read returned 200 at **0.30 seconds**. The same artifacts became readable later with the expected size/digest. This is evidence for short metadata-visibility delay, not evidence of archive growth. These production observations were supplied by the brief; this task did not access stage/production or independently remeasure them.

The candidate makes at most **8 GET attempts in 60 seconds**, with a **5-second per-read deadline including response-body consumption**. It waits **1, 2, 3, 4, 5, 6, 7 seconds** between immediate failures. A seconds or HTTP-date Retry-After increases the corresponding delay, capped at **10 seconds** and still bounded by the total deadline. Immediate repeated 404/5xx exhaust eight attempts after 28 seconds of waits; slow/stalled reads may reach the 60-second ceiling first. An independent Promise race bounds even a noncooperative network/body; AbortController releases real requests. If the next required wait cannot fit, validation stops without sending an early read.

Only 404, 429, HTTP 500–599 and transport/timeouts retry, always at the identical accepted-upload artifact ID. There is no upload/rebuild or candidate-code rerun. Nontransient HTTP responses, including 401/403, refuse immediately. Malformed JSON, wrong ID/digest, invalid sizes and verified over-limit metadata fail without retry. The step explicitly checks metadata against the accepted upload ID and SHA-256 digest and retains the safe-integer/nonnegative size requirement and 64 MiB cap. An oversized error includes measured and allowed bytes. Exhaustion distinguishes metadata failure from oversize and includes the last observed HTTP status and actual attempt count. Missing metadata never succeeds.

## Actual proof results

The existing workflowScript helper extracts the program actually run by the workflow. Each case launches Node on that extracted program, replaces only the GitHub network edge, and uses a virtual clock to exercise the real delays/deadlines without minute-long sleeps. All reads assert GET, the exact same URL/artifact ID and a request abort signal. No reimplementation of the validator is tested.

| Required proof | Observed result from assertions in the executed program |
| --- | --- |
| 404 then valid metadata | Success after exactly 2 reads, 1,000 ms apart; logs 3,069,901 bytes. |
| Persistent 404 and 5xx | Fail closed. Immediate 404 and 503 each stop at 8/8 attempts with last HTTP 404/503; a slow 503 sequence also stays within 60 seconds and preserves last HTTP 503 when its final read times out. No oversize diagnosis. |
| 401/403 | Each refuses after exactly 1 read, reporting its HTTP status. |
| Valid over-limit metadata | 67,108,865 bytes refuses after 1 read; error states measured 67,108,865 and allowed 67,108,864 bytes. |
| Under-limit metadata | 3,069,901 bytes succeeds after 1 read and reports that byte count. Exactly 67,108,864 also succeeds. |

Additional assertions in the same file prove transport recovery; 429 Retry-After waits of 3 seconds, a 999-second value bounded to 10 seconds, and a 4-second HTTP-date; bounded stalled fetch/body reads; and immediate failure for invalid/mismatching identity, negative/fractional/string/unsafe/null sizes, null metadata and malformed JSON.

Focused command: `node --test tests/artifact-metadata.test.mjs`: **7 tests, 7 pass, 0 fail** (metadata-tests.tap).

Existing/full local suite: **38/40 passing before → 45/47 passing after**. The identical two pre-existing failures are the producer character-device and block-device tests: this VM lacks `sudo`, and their unavailable-command branch dereferences undefined `stderr` at tests/producer-stage.test.mjs:157. The feature's seven tests pass; this unrelated existing test file was left unchanged. Complete actual outputs are baseline-tests.tap and full-tests.tap. Local runtime is Node 24.19.0; the repository has no local runtime/package-manager pins. Hosted Verify runs the repository's full test command with Node 26.8.1 and is **completed/success on the exact product SHA**. No failing CI run or log-download retry occurred. No test-level hosted counts are inferred from the REST status alone.

`git diff --check` passed. GitHub REST budget used: **2/10 calls** (draft PR creation and exact-SHA run discovery, which already returned completed/success). No repeated polling was necessary. Actual API response files and normalized receipts are included; assertions verified the returned run SHA and conclusion.

## Clause/status and custody

U96-01: previously a valid upload could fail from a single immediate metadata 404; now implemented and proved on the candidate with exact-head Verify green. This is a candidate implementation status change, pending fleet landing and owning-lane adoption, not an independent production acceptance claim. No clause ledger files exist here, so there are no generated-clause counts to modify.

Product push: first attempt successful, branch and SHA as above. Author and committer are Run Edit Run fleet <fleet@runeditrun.com>; no commit trailers. Draft PR remains for the lane. No implementation blocker remains. The known local test-environment issue is recorded with unchanged before/after failures; hosted exact-head Verify is successful.

Packet: REPORT.md, PLAN.md, product-receipt.json, ci-receipt.json, pr-receipt.json, ci-discovery.json, metadata-tests.tap, baseline-tests.tap, full-tests.tap. These are actual regular non-secret files selected explicitly for report-only evidence publication. Evidence transport is separate from product READY and neither signals landing nor substitutes for independent gates. The final message supplies the resulting exact evidence ref/head.
