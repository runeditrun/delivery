import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const workflow = await readFile(new URL('../.github/workflows/trusted-build.yml', import.meta.url), 'utf8');
const scripts = [...workflow.matchAll(/          node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/g)].map(m => m[1].replace(/^          /gm, ''));
const project = { schema: 1, deployment: { target: 'cloudflare-workers', artifactFile: 'rer-worker-artifact.json' }, operations: { setup: 'echo setup >> order', build: 'echo build >> order', verify: 'echo verify >> order', artifact: 'echo artifact >> order' } };
const temporary = async t => { const dir = await mkdtemp(join(tmpdir(), 'rer-delivery-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };
const run = (source, cwd, env = {}) => execFileSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
test('project-owned commands run without pnpm or edition files and propagate failure', async t => {
 const dir = await temporary(t);
 await writeFile(join(dir, 'rer-project.json'), JSON.stringify(project));
 run(scripts[0], dir, { ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full' });
 assert.equal(await readFile(join(dir, 'order'), 'utf8'), 'setup\nbuild\nverify\nartifact\n');
 await writeFile(join(dir, 'rer-project.json'), JSON.stringify({ ...project, operations: { build: 'exit 7', verify: 'touch should-not-run' } }));
 assert.throws(() => run(scripts[0], dir, { ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full' }));
 await assert.rejects(readFile(join(dir, 'should-not-run')));
});
async function attest(t, overrides = {}, artifactOverrides = {}, envOverrides = {}, manifestSymlink = false) {
 const dir = await temporary(t); await mkdir(join(dir, 'candidate'));
 const artifact = { schema: 1, deploymentSpec: { schema: 1 }, mainModule: 'worker.js', modules: [{ name: 'worker.js', type: 'esm', contentBase64: Buffer.from('export default {}').toString('base64') }], assets: [] };
 await writeFile(join(dir, 'candidate/rer-worker-artifact.json'), JSON.stringify({ ...artifact, ...artifactOverrides }));
 if (manifestSymlink) { await rm(join(dir, 'candidate/rer-worker-artifact.json')); await symlink('../outside.json', join(dir, 'candidate/rer-worker-artifact.json')); await writeFile(join(dir, 'outside.json'), JSON.stringify(artifact)); }
 const remote = JSON.stringify({ ...project, ...overrides });
 const prelude = `globalThis.fetch = async url => { if (String(url).includes('oidc')) return Response.json({value:'x.'+Buffer.from(JSON.stringify({job_workflow_ref:'org/delivery/.github/workflows/trusted-build.yml@'+'a'.repeat(40), repository_id:'1',repository_owner_id:'2'})).toString('base64url')+'.x'}); if(String(url).includes('/git/commits/'))return Response.json({sha:'b'.repeat(40),tree:{sha:'c'.repeat(40)}}); if(String(url).includes('sources.lock'))throw Error('Project mode must not fetch unused source lock'); if(String(url).includes('rer-project.json'))return Response.json({encoding:'base64',content:Buffer.from(${JSON.stringify(remote)}).toString('base64')}); throw Error('unexpected fetch '+url); };\n`;
 const env = { BROKER_URL: 'https://broker.example', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example?x=1', GITHUB_REPOSITORY: 'org/app', GITHUB_SHA: 'b'.repeat(40), BUILD_PROFILE: 'project', ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full', GITHUB_RUN_ID: '3', GITHUB_RUN_ATTEMPT: '1' };
 run(prelude + scripts[1], dir, { ...env, ...envOverrides });
 return { receipt: JSON.parse(await readFile(join(dir, 'accepted/release-provenance.json'), 'utf8')), remote };
}
test('isolated attestation binds generic package to immutable descriptor and source tree without source lock', async t => {
 const { receipt, remote } = await attest(t);
 assert.equal(receipt.sourceProvenance, 'project-descriptor');
 assert.equal(receipt.sourceLockSha256, createHash('sha256').update(remote).digest('hex'));
 assert.equal(receipt.treeSha, 'c'.repeat(40)); assert.equal(receipt.artifactFile, 'rer-worker-artifact.json');
});
test('immutable descriptor mismatch prevents generic attestation', async t => {
 await assert.rejects(attest(t, { deployment: { target: 'other', artifactFile: 'rer-worker-artifact.json' } }));
});
test('only isolated attestation job has OIDC and never checks out candidate', () => {
 const [build, attestJob] = workflow.split('  attest:');
 assert.doesNotMatch(build, /id-token: write/); assert.match(attestJob, /id-token: write/);
 assert.doesNotMatch(attestJob, /uses: actions\/checkout|execFileSync|pnpm /);
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
 run(scripts[0], dir, { ARTIFACT_FILE: 'rer-worker-artifact.json', VERIFICATION_PROFILE: 'full' });
 assert.equal(await readFile(join(dir, 'order'), 'utf8'), 'setup\nbuild\nverify\nartifact\n');
 const { receipt } = await attest(t, { deployment: descriptor.deployment });
 assert.equal(receipt.artifactFile, 'rer-worker-artifact.json');
});
