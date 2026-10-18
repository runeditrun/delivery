# Trusted build-input contract

Receipt schema **3** retains every schema-2 identity field and `artifactSchema: 2`.
It adds `buildInputs`, `buildInputsSha256` and `promotion`. The manifest/payload
format and the OIDC broker request stay unchanged. The receipt is authenticated
by the isolated trusted job, GitHub artifact/run identity and archive digest plus
broker-verified OIDC; it is not a standalone detached cryptographic signature.

`buildInputs.schema` is **1**. Its fields are:

| Field | Content |
| --- | --- |
| `repository` | `name`, `id`, `ownerId` from workflow context/OIDC |
| `source` | `commitSha`, `treeSha`, `kind` (`source-lock` or `project-descriptor`), `sha256` of that immutable source document |
| `workflow` | Full pinned reusable-workflow `ref` and its 40-character `sha` |
| `buildProfile`, `verificationProfile`, `artifactFile` | Exact selected workflow inputs |
| `suppliedInputs` | Complete effective `workflow_call` inputs, including defaults; no arbitrary secret/environment capture |
| `commands` | Ordered phase, executable, and argument arrays; project shell strings come from the immutable descriptor; the edition browser phase also records `nodePin` |
| `node` | Immutable selected `pin` and `pinSource`, `observedVersion`, build-job `reportedPin` and `reportedPinSource` |
| `packageManager` | Immutable declaration `pin` (including any integrity suffix), `pinSource`, build-job `observedVersion`; absent declarations/observations use `null` |
| `toolchain` | `observation`, `observationTrust`, `provisioning` |
| `constraints` | Contract, ambient-state limitations, provisioning environment, command environment and execution boundary |

`toolchain.observation` is nullable. Observation schema 1 records `runner`, `os`,
`arch`, `imageOS`, `imageVersion`, `osReleaseSha256`, `kernel`, `nodeSha256`,
`bashSha256`, `commandPath`. These are pre-command build-job observations, **not
isolated measurements**. They cannot grant eligibility. `provisioning` records
package-manager installation argv; editions also record browser Node selection,
Playwright invocation and apt commands. Floating browser Node has no complete
patch observation (`observedVersion: null`). This record does not claim a digest
of every executable, fetched package or runner file.

At Bash exec entry, project commands, edition dependency lifecycle scripts,
browser installation and verification/packaging receive only `PATH`, `HOME`,
`TMPDIR`, `CI`, `LANG`, `LC_ALL`, `TZ`. PATH records a pre-command baseline and can change across edition steps; HOME is
initially emptied at `/tmp/rer-build-home`; the other values are fixed in the
workflow. Bash runs with `--noprofile --norc -e -o pipefail`. Shells and tools can
add their own variables. Trusted provisioning still inherits the host environment.
This is environment hygiene, not process/filesystem/network/clock confinement.

`constraints.ambient` records source GitHub SHA/ref and explicitly incomplete
clock recording. Git metadata, parent-process environment and filesystem, wall
clock, network, host tools, randomness and mutable package repositories remain
accessible. Candidate processes can mutate same-job output files and tools.
Consequently `promotion` is **always** `{eligible: false, reasons: string[]}` for
`hosted-unrestricted-v1`, even with complete observations or a candidate claiming
otherwise. Additional reasons identify missing/mismatched Node/manager/toolchain
observations and edition browser/package-state gaps. Invalid immutable metadata,
artifact structure, paths, digests, runtime format or broker origin still refuse.
There is **no eligible executor in this revision**. Establishing one requires a
separately reviewed trusted execution contract and workflow revision.

`buildInputsSha256` is lowercase SHA-256 of UTF-8 canonical JSON of `buildInputs`:
recursively sort object keys using JavaScript `.sort()`, preserve array order,
serialize scalar values with `JSON.stringify`, use no whitespace or final LF.
All field names and nulls participate. Run id/attempt and artifact digests remain
in the outer receipt, not this input digest. Equal digests do not imply eligibility;
commit SHA is included, so this digest is not a cross-commit promotion cache key.

The next platform consumer must:

1. Keep all current authorization, OIDC, workflow-pin, run/attempt success,
   immutable source, archive/manifest/payload digest and acceptance checks.
2. Continue accepting valid receipt schemas 1/2 for their existing release flow;
   treat both as not promotable. Accept schema 3 for normal releases only after
   explicitly supporting this contract. Unknown versions never grant promotion.
3. For schema 3, validate types/required fields, recompute the input digest,
   cross-check duplicated outer identity fields and independently resolve source
   metadata, effective inputs and the trusted workflow contract. Missing, corrupt
   or mismatched input records never authorize reuse.
4. Treat every receipt from this workflow as ineligible. Never accept an asserted
   `eligible: true` for `hosted-unrestricted-v1`. A future eligible contract must
   prove complete inputs and enforce the absence of unrecorded ambient inputs.
   It must separately authenticate proposal/merge lineage, exact tree equality,
   fresh production source/configuration and all existing publication gates.

Current platform main accepts only schemas 1/2 and will refuse schema 3. Deploy
the coordinated consumer before repinning customer workflows to this revision.
This repository change does not adopt a new workflow pin in any application.
