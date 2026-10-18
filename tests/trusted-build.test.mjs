import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { workflow, workflowScript } from './workflow-script.mjs';
const attestScript = workflowScript('Convert candidate artifact to a bounded raw-payload package and record source identity');
const projectScript = workflowScript('Run project-owned setup, build, verification and artifact commands');
const project = { schema: 1, deployment: { target: 'cloudflare-workers', artifactFile: 'rer-worker-artifact.json' }, operations: { setup: 'echo setup >> order', build: 'echo build >> order', verify: 'echo verify >> order', artifact: 'echo artifact >> order' } };
const temporary = async t => { const dir = await mkdtemp(join(tmpdir(), 'rer-delivery-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };
const run = (source, cwd, env = {}) => execFileSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
test('project-owned commands receive declared pnpm, work undeclared and propagate failure', async t => {
 const dir = await temporary(t);
 const bin = join(dir, 'bin');
 await mkdir(bin);
 // Fake only the global npm installation edge; the workflow selects and invokes the installed CLI.
 await writeFile(join(bin, 'npm'), `#!${process.execPath}
 const fs = require('node:fs');
 const path = require('node:path');
 const args = process.argv.slice(2);
 fs.appendFileSync('installs', JSON.stringify(args) + '\\n');
 const [manager, requested] = args.at(-1).split('@');
 const version = process.env.INSTALLED_VERSION ?? requested;
 fs.writeFileSync(path.join(${JSON.stringify(bin)}, manager), "#!/bin/sh\\nprintf '%s\\\\n' '" + version + "'\\n", { mode: 0o755 });
 `, { mode: 0o755 });
 const env = { ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full', PATH: `${bin}:${process.env.PATH}` };
 await writeFile(join(dir, 'rer-project.json'), JSON.stringify(project));
 run(projectScript, dir, env);
 assert.equal(await readFile(join(dir, 'order'), 'utf8'), 'setup\nbuild\nverify\nartifact\n');
 await assert.rejects(readFile(join(dir, 'installs')));
 const managed = { ...project, packageManager: 'pnpm@9.15.4', operations: { ...project.operations, setup: 'pnpm --version >> order' } };
 for (const [manifest, expected] of [[undefined, '9.15.4'], [{}, '9.15.4'], [{ packageManager: 'pnpm@10.12.4' }, '10.12.4']]) {
  await rm(join(dir, 'order'));
  await writeFile(join(dir, 'rer-project.json'), JSON.stringify(managed));
  if (manifest) await writeFile(join(dir, 'package.json'), JSON.stringify(manifest));
  run(projectScript, dir, env);
  assert.equal(await readFile(join(dir, 'order'), 'utf8'), `${expected}\nbuild\nverify\nartifact\n`);
  const installs = (await readFile(join(dir, 'installs'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(installs.at(-1), ['install', '--global', '--no-audit', '--no-fund', `pnpm@${expected}`]);
 }
 await rm(join(dir, 'order'));
 assert.throws(() => run(projectScript, dir, { ...env, INSTALLED_VERSION: '9.15.4' }), error => /version mismatch/.test(error.stderr.toString()));
 await assert.rejects(readFile(join(dir, 'order')));
 const installsBefore = await readFile(join(dir, 'installs'), 'utf8');
 for (const packageManager of ['pnpm@latest', 'pnpm@^10.12.4', 'pnpm@10', 'pnpm@10.12.4\ntouch injected', 'unknown@1.2.3', null]) {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ packageManager }));
  assert.throws(() => run(projectScript, dir, env), error => /must pin an exact/.test(error.stderr.toString()));
  await assert.rejects(readFile(join(dir, 'order')));
  assert.equal(await readFile(join(dir, 'installs'), 'utf8'), installsBefore);
 }
 await writeFile(join(dir, 'package.json'), '{}');
 await writeFile(join(dir, 'rer-project.json'), JSON.stringify({ ...project, operations: { build: 'exit 7', verify: 'touch should-not-run' } }));
 assert.throws(() => run(projectScript, dir, env));
 await assert.rejects(readFile(join(dir, 'should-not-run')));
});
async function attest(t, overrides = {}, artifactOverrides = {}, envOverrides = {}, manifestSymlink = false) {
 const dir = await temporary(t); await mkdir(join(dir, 'candidate'));
 const artifact = { schema: 1, deploymentSpec: { schema: 1 }, mainModule: 'worker.js', modules: [{ name: 'worker.js', type: 'esm', contentBase64: Buffer.from('export default {}').toString('base64') }], assets: [] };
 await writeFile(join(dir, 'candidate/rer-worker-artifact.json'), JSON.stringify({ ...artifact, ...artifactOverrides }));
 if (manifestSymlink) { await rm(join(dir, 'candidate/rer-worker-artifact.json')); await symlink('../outside.json', join(dir, 'candidate/rer-worker-artifact.json')); await writeFile(join(dir, 'outside.json'), JSON.stringify(artifact)); }
 const remote = JSON.stringify({ ...project, ...overrides });
 const prelude = `globalThis.fetch = async url => { if (String(url).includes('oidc')) return Response.json({value:'x.'+Buffer.from(JSON.stringify({job_workflow_ref:'org/delivery/.github/workflows/trusted-build.yml@'+'a'.repeat(40), repository_id:'1',repository_owner_id:'2'})).toString('base64url')+'.x'}); if(String(url).includes('/git/commits/'))return Response.json({sha:'b'.repeat(40),tree:{sha:'c'.repeat(40)}}); if(['package.json','.node-version','.nvmrc','scripts/agent-bootstrap.sh'].some(name => String(url).includes('/contents/'+name+'?ref=')))return new Response(null,{status:404}); if(String(url).includes('sources.lock'))throw Error('Project mode must not fetch unused source lock'); if(String(url).includes('rer-project.json'))return Response.json({encoding:'base64',content:Buffer.from(${JSON.stringify(remote)}).toString('base64')}); throw Error('unexpected fetch '+url); };\n`;
 const env = { BROKER_URL: 'https://broker.example', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example?x=1', GITHUB_REPOSITORY: 'org/app', GITHUB_SHA: 'b'.repeat(40), BUILD_PROFILE: 'project', ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full', NODE_VERSION: process.versions.node, NODE_VERSION_SOURCE: 'default', GITHUB_RUN_ID: '3', GITHUB_RUN_ATTEMPT: '1' };
 const supplied = { build_profile: env.BUILD_PROFILE, artifact_file: env.ARTIFACT_FILE, verification_profile: env.VERIFICATION_PROFILE, pnpm_version: '8.15.6', installation_id: 'installation', broker_url: env.BROKER_URL, environment: 'preview' };
 run(prelude + attestScript, dir, { WORKFLOW_INPUTS_JSON: JSON.stringify(supplied), ...env, ...envOverrides });
 return { receipt: JSON.parse(await readFile(join(dir, 'accepted/release-provenance.json'), 'utf8')), remote };
}
test('isolated attestation binds generic package to immutable descriptor and source tree without source lock', async t => {
 const { receipt, remote } = await attest(t);
 assert.equal(receipt.sourceProvenance, 'project-descriptor');
 assert.equal(receipt.sourceLockSha256, createHash('sha256').update(remote).digest('hex'));
 assert.equal(receipt.treeSha, 'c'.repeat(40)); assert.equal(receipt.artifactFile, 'rer-worker-artifact.json');
});
test('isolated provenance records the build runtime rather than its own Node and rejects invalid runtime outputs', async t => {
 for (const [version, source] of [['20.19.5', '.nvmrc'], ['24.8.0', 'package.json:volta.node'], [process.versions.node, 'default']]) {
  const { receipt } = await attest(t, {}, {}, { NODE_VERSION: version, NODE_VERSION_SOURCE: source });
  assert.equal(receipt.nodeVersion, version);
  assert.equal(receipt.nodeVersionSource, source);
 }
 for (const runtime of [{ NODE_VERSION: '>=20' }, { NODE_VERSION: 'v20.19.5' }, { NODE_VERSION: '' }, { NODE_VERSION_SOURCE: 'untrusted' }]) {
  await assert.rejects(attest(t, {}, {}, runtime), error => /Invalid build Node runtime/.test(error.stderr.toString()));
 }
 assert.match(workflow, /NODE_VERSION: \$\{\{ needs\.build\.outputs\.node_version \}\}/);
 assert.match(workflow, /NODE_VERSION_SOURCE: \$\{\{ needs\.build\.outputs\.node_version_source \}\}/);
});
test('immutable descriptor mismatch prevents generic attestation', async t => {
 await assert.rejects(attest(t, { deployment: { target: 'other', artifactFile: 'rer-worker-artifact.json' } }));
});
test('only isolated attestation job has OIDC and never checks out candidate', () => {
 const [build, attestJob] = workflow.split('  attest:');
 assert.doesNotMatch(build, /id-token: write/); assert.match(attestJob, /id-token: write/);
 assert.doesNotMatch(attestJob, /uses: actions\/checkout|node:child_process|(?<!\.)\b(?:execFileSync|spawn|exec)\s*\(/);
 assert.match(build, /persist-credentials: false/);
 assert.match(build, /default: edition/);
});

test('attestation rejects traversal, secret entries, wrong broker origins and filename substitution', async t => {
 for (const name of ['../worker.js', '/worker.js', 'payload/worker.js', 'dir/.env', 'worker\\name.js']) {
  await assert.rejects(attest(t, {}, { mainModule: name, modules: [{ name, type: 'esm', contentBase64: 'YQ==' }] }));
 }
 for (const origin of ['http://broker.example', 'https://user@broker.example', 'https://broker.example/path']) {
  await assert.rejects(attest(t, {}, {}, { BROKER_URL: origin }));
 }
 await assert.rejects(attest(t, {}, {}, { ARTIFACT_FILE: '../rer-worker-artifact.json' }));
 await assert.rejects(attest(t, { deployment: { target: 'cloudflare-workers', artifactFile: 'different.json' } }));
 await assert.rejects(attest(t, {}, {}, { VERIFICATION_PROFILE: 'visual' }));
});

test('candidate manifest symlinks and missing generic deployment specifications are rejected', async t => {
 await assert.rejects(attest(t, {}, {}, {}, true));
 await assert.rejects(attest(t, {}, { deploymentSpec: undefined }));
});

test('registered default artifact filename works in build and independent attestation', async t => {
 const descriptor = { ...project, deployment: { target: 'cloudflare-workers' } };
 const dir = await temporary(t);
 await writeFile(join(dir, 'rer-project.json'), JSON.stringify(descriptor));
 run(projectScript, dir, { ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full' });
 assert.equal(await readFile(join(dir, 'order'), 'utf8'), 'setup\nbuild\nverify\nartifact\n');
 const { receipt } = await attest(t, { deployment: descriptor.deployment });
 assert.equal(receipt.artifactFile, 'rer-worker-artifact.json');
});
