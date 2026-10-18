import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { produce, descriptor, observation, temporary } from './build-input-fixture.mjs';
import { workflowScript } from './workflow-script.mjs';
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);

test('isolated producer hashes canonical inputs identically across runs and object order', async t => {
 const first = await produce(t);
 const second = await produce(t, { inputs: { environment: 'preview', broker_url: 'https://broker.example', installation_id: 'installation' }, env: { GITHUB_RUN_ID: '9', GITHUB_RUN_ATTEMPT: '2' }, observation: Object.fromEntries(Object.entries(observation).reverse()) });
 assert.deepEqual(first.buildInputs, second.buildInputs);
 assert.equal(first.buildInputsSha256, second.buildInputsSha256);
 assert.equal(first.buildInputsSha256, createHash('sha256').update(canonical(first.buildInputs)).digest('hex'));
 assert.notEqual(first.runId, second.runId);
 assert.equal(first.promotion.eligible, false);
});

test('each source, workflow, profile, toolchain and supplied argument changes the produced identity', async t => {
 const baseline = await produce(t);
 const variants = [
  { repository: 'org/other' }, { claims: { repository_id: '7' } }, { claims: { repository_owner_id: '8' } },
  { source: { sha: 'd'.repeat(40) } }, { source: { tree: { sha: 'e'.repeat(40) } } },
  { project: { ...descriptor, extraSourceInput: 'changed' } },
  { claims: { job_workflow_ref: 'runeditrun/delivery/.github/workflows/trusted-build.yml@' + 'f'.repeat(40) } },
  { profile: 'edition' }, { artifactFile: 'other.json', project: { ...descriptor, deployment: { ...descriptor.deployment, artifactFile: 'other.json' } } },
  { env: { GITHUB_REF: 'refs/heads/other' } }, { nodePin: '24.8.0' }, { env: { NODE_PIN: '24.8.0' } }, { env: { NODE_VERSION: '24.8.0' } }, { env: { NODE_VERSION_SOURCE: '.nvmrc' } },
  { package: { packageManager: descriptor.packageManager } }, { package: { packageManager: 'yarn@4.9.1' }, env: { PACKAGE_MANAGER_VERSION: '4.9.1' } },
  { env: { PACKAGE_MANAGER_VERSION: '9.15.4' } },
  ...['runner', 'os', 'arch', 'imageOS', 'imageVersion', 'osReleaseSha256', 'kernel', 'nodeSha256', 'bashSha256', 'commandPath'].map(key => ({ observation: { ...observation, [key]: observation[key] + '-changed' } })),
  ...['installation_id', 'broker_url', 'environment', 'pnpm_version'].map(key => ({ inputs: { [key]: 'changed' } })),
  ...['setup', 'build', 'verify', 'artifact'].map(key => ({ project: { ...descriptor, operations: { ...descriptor.operations, [key]: 'node command.mjs --changed' } } })),
 ];
 for (const variant of variants) {
  const changed = await produce(t, variant);
  assert.notEqual(changed.buildInputsSha256, baseline.buildInputsSha256);
  assert.equal(changed.promotion.eligible, false);
 }
 const edition = await produce(t, { profile: 'edition' });
 for (const variant of [{ inputs: { verification_profile: 'visual' } }, { lock: '{"schema":1,"changed":true}' }]) {
  assert.notEqual((await produce(t, { profile: 'edition', ...variant })).buildInputsSha256, edition.buildInputsSha256);
 }
});

test('missing or forged observations never make a hosted build promotable', async t => {
 for (const env of [{ BUILD_OBSERVATION: '' }, { NODE_PIN: '' }, { PACKAGE_MANAGER_VERSION: '' }, { BUILD_OBSERVATION: JSON.stringify({ ...observation, eligible: true, constraints: { network: 'denied', clock: 'fixed' } }) }]) {
  const receipt = await produce(t, { project: { ...descriptor, promotion: { eligible: true } }, env });
  assert.equal(receipt.promotion.eligible, false);
  assert.ok(receipt.promotion.reasons.length);
 }
});

test('real project commands lose GitHub environment but can read time, git and network, so their artifacts stay ineligible', async t => {
 const root = await temporary(t);
 const server = createServer((req, res) => res.end('network-input'));
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 t.after(() => new Promise(resolve => server.close(resolve)));
 await promisify(execFile)('git', ['init', '-q', root]);
 const code = `const fs=require('node:fs');const cp=require('node:child_process');fetch('http://127.0.0.1:${server.address().port}').then(r=>r.text()).then(network=>fs.writeFileSync('ambient.json',JSON.stringify({githubSha:'GITHUB_SHA' in process.env,githubRef:'GITHUB_REF' in process.env,custom:'RER_TEST_AMBIENT' in process.env,nodeOptions:'NODE_OPTIONS' in process.env,clock:Boolean(cp.execFileSync('date',['+%s']).toString().trim()),git:fs.existsSync('.git/HEAD'),network:network==='network-input'})));`;
 const project = { ...descriptor, packageManager: undefined, operations: { build: `node -e '${code.replaceAll("'", "'\\''")}'`, verify: 'test -s ambient.json', artifact: `node -e 'require("node:fs").writeFileSync("artifact.json",JSON.stringify({schema:1,deploymentSpec:{schema:1},mainModule:"worker.js",modules:[{name:"worker.js",type:"text",contentBase64:require("node:fs").readFileSync("ambient.json").toString("base64")}],assets:[]}))'` } };
 await writeFile(join(root, 'rer-project.json'), JSON.stringify(project));
 await promisify(execFile)(process.execPath, ['--input-type=module', '-e', workflowScript('Run project-owned setup, build, verification and artifact commands')], { cwd: root, env: { ...process.env, ARTIFACT_FILE: descriptor.deployment.artifactFile, VERIFICATION_PROFILE: 'full', GITHUB_SHA: 'test-only-sha', GITHUB_REF: 'test-only-ref', RER_TEST_AMBIENT: 'test-only-value', NODE_OPTIONS: '--no-warnings' } });
 assert.deepEqual(JSON.parse(await readFile(join(root, 'ambient.json'))), { githubSha: false, githubRef: false, custom: false, nodeOptions: false, clock: true, git: true, network: true });
 const receipt = await produce(t, { project, artifact: JSON.parse(await readFile(join(root, 'artifact.json'))) });
 assert.equal(receipt.promotion.eligible, false);
 for (const reason of ['unrestricted-clock', 'unrestricted-network', 'source-git-metadata-readable']) assert.ok(receipt.promotion.reasons.includes(reason));
});


test('isolated Node pin resolution follows immutable source precedence and never executes bootstrap', async t => {
 const variants = [
  { files: { '.node-version': 'v24.8.0', '.nvmrc': '22.20.0' }, version: '24.8.0', source: '.node-version' },
  { files: { '.node-version': 'lts/*', '.nvmrc': '22.20.0' }, version: '22.20.0', source: '.nvmrc' },
  { files: { '.node-version': null }, package: { engines: { node: '20.19.5' }, volta: { node: '24.8.0' } }, version: '20.19.5', source: 'package.json:engines.node' },
  { files: { '.node-version': null }, package: { engines: { node: '>=20' }, volta: { node: '24.8.0' } }, version: '24.8.0', source: 'package.json:volta.node' },
  { files: { '.node-version': null, 'scripts/agent-bootstrap.sh': 'exit 99\nreadonly NODE_VERSION="18.20.8" # literal\n' }, version: '18.20.8', source: 'scripts/agent-bootstrap.sh:NODE_VERSION' },
 ];
 for (const variant of variants) {
  const receipt = await produce(t, { ...variant, env: { NODE_PIN: variant.version, NODE_VERSION: variant.version, NODE_VERSION_SOURCE: variant.source } });
  assert.equal(receipt.buildInputs.node.pin, variant.version);
  assert.equal(receipt.buildInputs.node.pinSource, variant.source);
  assert.ok(!receipt.promotion.reasons.includes('missing-or-mismatched-node-pin'));
 }
});
