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

This repository contains no deployment credentials. Customer applications keep
their source and runtime resources in their own accounts.
