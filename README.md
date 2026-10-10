# Run Edit Run delivery

Public reusable GitHub Actions workflow for customer-owned RER editions.
The management service and customer credentials are separate.

Pin `.github/workflows/trusted-build.yml` to a full commit SHA. A candidate job
builds and verifies the customer repository without deployment credentials.
A separate job records source and artifact identity and authenticates to the
customer installation broker with GitHub OIDC. The broker prepares the release
for the configured owner acceptance policy.

The caller supplies `installation_id`, the HTTPS `broker_url`, the accepted
`environment`, `pnpm_version` (8.15.6 for Lamp or 10.12.4 for HappyToHelp),
and `artifact_file` (`lamp-worker-artifact.json` or
`happytohelp-worker-artifact.json`). The repository must provide the maintained
`pnpm verify` command and `scripts/build-delivery-artifact.mjs`.

`verification_profile` defaults to `full`. The explicit `visual` profile runs
`pnpm verify:visual` instead, for focused visual source validation, type checking,
building, and browser verification. Both profiles use the same credential-free
build and isolated OIDC attestation; the independently produced provenance records
which profile ran. A visual result never claims full verification. The broker
and owner acceptance policy determine whether the source is eligible to publish.

This repository contains no deployment credentials. Customer applications keep
their source and runtime resources in their own accounts.

Both build profiles use the first exact Node release declared by `.node-version`,
`.nvmrc`, `package.json`'s `engines.node`, then `volta.node`, then a literal
`NODE_VERSION` in `scripts/agent-bootstrap.sh`. File and manifest pins may have a
leading `v`. Ranges, partial versions and aliases are skipped; with no exact pin,
the build uses Node 26.8.1. Bootstrap scripts are read, never executed for selection.
The existing edition browser-install workaround temporarily uses Node 22; the
selected release is restored before verification and packaging. Independent
`release-provenance.json` records that build runtime as `nodeVersion` and its pin
source as `nodeVersionSource`, using trusted build-step outputs rather than
candidate artifact fields. The attestation job keeps its separate runtime.

## Framework-neutral projects

Set `build_profile: project` and `artifact_file: rer-worker-artifact.json` (or the
filename declared by the project). Commit `rer-project.json` with the registered
schema-1 project descriptor. Its deployment target is `cloudflare-workers` and
its `deployment.artifactFile` (default `rer-worker-artifact.json`) must equal the
workflow input. Its `operations`
contains shell command strings: optional `setup`, required `build` and `verify`,
and optional `artifact`, executed in that order with Bash failure propagation.
The build or artifact command writes `delivery-artifact/<artifactFile>` in the
existing Cloudflare schema-1 module/asset format, including its explicit
`deploymentSpec` for the registered Cloudflare adapter. Commands may install and use any
language or framework toolchain available on the Ubuntu runner; the workflow does
not install pnpm, browsers or edition verification tools in project mode. The
selected Node is available to the harness and project commands. Project mode requires the `full`
verification profile. Project commands run without deployment credentials or OIDC.

The isolated attestation job retrieves the descriptor at the immutable source
commit and verifies its target and artifact filename. It never runs project
commands. Its receipt records `sourceProvenance: project-descriptor` and the
exact descriptor SHA-256 in the legacy-named `sourceLockSha256` field; the commit
and tree identities remain mandatory. Projects do not require `sources.lock.json`.
Edition mode remains the default, with `sourceProvenance: source-lock` and the
existing mandatory source lock. The broker must support the matching provenance
kind before adopting this workflow revision. The Cloudflare adapter is explicit;
this workflow does not claim deployment support for other providers.

Run local workflow contract checks with `node --test tests/*.test.mjs`. These
execute extracted workflow scripts with test-only GitHub/OIDC responses and real
local artifacts; they do not establish hosted GitHub Actions or provider proof.
