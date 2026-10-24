import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { workflowScript } from './workflow-script.mjs';

const materialize = workflowScript('Materialize the exact projected pin tree in a neutral workspace');
const projectCommands = workflowScript('Run project-owned setup, build, verification and artifact commands');
const stage = workflowScript('Validate and stage producer package');
const attest = workflowScript('Convert candidate artifact to a bounded raw-payload package and record source identity');
const prepare = workflowScript('Prepare release through authenticated broker');
const neutral = '/tmp/rer-pin-source';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (source, cwd, env) => execFileSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' });
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'delivery-pin-')), checkout = join(root, 'pin-source');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(checkout, '.github/workflows'), { recursive: true });
  git(checkout, 'init', '-q');
  git(checkout, 'config', 'user.name', 'Test publisher');
  git(checkout, 'config', 'user.email', 'publisher@example.test');
  const project = { schema: 1, deployment: { target: 'cloudflare-workers', artifactFile: 'app.json' }, operations: { build: 'node build.mjs', verify: 'test -s delivery-artifact/app.json' } };
  const descriptor = JSON.stringify(project);
  await writeFile(join(checkout, 'rer-project.json'), descriptor);
  await writeFile(join(checkout, 'build.mjs'), `import {mkdir,writeFile} from 'node:fs/promises';
    await mkdir('delivery-artifact');
    const worker = 'export default ' + JSON.stringify({ workspace: process.cwd() });
    await writeFile('delivery-artifact/app.json', JSON.stringify({schema:1,deploymentSpec:{schema:1},mainModule:'worker.js',modules:[{name:'worker.js',type:'esm',contentBase64:Buffer.from(worker).toString('base64')}],assets:[]}));
  `);
  await writeFile(join(checkout, '.github/workflows/upstream.yml'), 'on: push\n');
  await writeFile(join(checkout, 'metadata.json'), '{"publisherAutomation":true}\n');
  git(checkout, 'add', '.');
  git(checkout, 'commit', '-qm', 'Publisher source');
  const sourceCommit = git(checkout, 'rev-parse', 'HEAD'), sourceTree = git(checkout, 'rev-parse', 'HEAD^{tree}');
  const generated = [];
  for (const [path, text] of [['.github/workflows/rer-managed.yml', 'on: workflow_dispatch\n'], ['metadata.json', '{"publisherAutomation":false}\n']]) {
    await writeFile(join(checkout, path), text);
    generated.push({ sha: git(checkout, 'hash-object', '-w', path), contentBase64: Buffer.from(text).toString('base64') });
  }
  await rm(join(checkout, '.github/workflows/upstream.yml'));
  git(checkout, 'add', '-A');
  const treeSha = git(checkout, 'write-tree');
  const files = git(checkout, 'ls-files', '--stage').split('\n').map(line => {
    const [, mode, sha, path] = /^(\d+) ([a-f0-9]{40}) 0\t(.+)$/.exec(line);
    return { path, mode, type: 'blob', sha };
  });
  git(checkout, 'reset', '--hard', '-q', sourceCommit);
  const workflowSha = 'a'.repeat(40), workflowRef = `org/delivery/.github/workflows/trusted-build.yml@${workflowSha}`;
  const projection = { schema: 1, sourceRepository: 'publisher/seed', sourceRepositoryId: '24681012', sourceCommit, sourceTree, treeSha, workflowRef, artifactFile: 'app.json', sourceProvenance: 'project-descriptor', sourceLockSha256: sha256(descriptor), files, generated };
  const env = { GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: 'org/delivery', GITHUB_WORKFLOW_REF: 'org/delivery/.github/workflows/trusted-build.yml@refs/heads/main', GITHUB_WORKFLOW_SHA: workflowSha, GITHUB_SHA: workflowSha, GITHUB_REF: 'refs/heads/main', SOURCE_REPOSITORY: projection.sourceRepository, SOURCE_REPOSITORY_ID: projection.sourceRepositoryId, SOURCE_COMMIT: sourceCommit, WORKFLOW_REF: workflowRef, BROKER_URL: 'https://broker.example', ARTIFACT_FILE: 'app.json', VERIFICATION_PROFILE: 'full', BUILD_PROFILE: 'project', NODE_VERSION: process.versions.node, NODE_VERSION_SOURCE: 'default', PIN_MODE: 'true', RELEASE_ENVIRONMENT: 'production', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example?x=1', GITHUB_RUN_ID: '77', GITHUB_RUN_ATTEMPT: '1' };
  const claims = { workflow_ref: env.GITHUB_WORKFLOW_REF, workflow_sha: workflowSha, event_name: 'workflow_dispatch', repository_id: '9988776655', repository_owner_id: '8877665544' };
  const network = (changes = {}) => `
    const networkProjection = ${JSON.stringify({ ...projection, ...changes.projection })};
    const networkClaims = ${JSON.stringify({ ...claims, ...changes.claims })};
    globalThis.fetch = async (url, init = {}) => {
      url = new URL(url);
      if (url.pathname.endsWith('/pin-source')) {
        if (url.searchParams.get('sourceCommit') !== ${JSON.stringify(sourceCommit)} || url.searchParams.get('workflowRef') !== ${JSON.stringify(workflowRef)}) throw Error('Wrong projection request');
        return Response.json(networkProjection);
      }
      if (url.hostname === 'oidc.example') return Response.json({value:'x.'+Buffer.from(JSON.stringify(networkClaims)).toString('base64url')+'.x'});
      if (url.pathname.includes('/git/commits/')) return Response.json({sha:${JSON.stringify(workflowSha)},tree:{sha:'b'.repeat(40)}});
      if (url.pathname.endsWith('/git/blobs/'+${JSON.stringify(files.find(file => file.path === 'rer-project.json').sha)})) return Response.json({encoding:'base64',content:Buffer.from(${JSON.stringify(changes.descriptor ?? descriptor)}).toString('base64')});
      if (url.pathname.endsWith('/prepare-pin') || url.pathname.endsWith('/prepare')) {
        console.log('PREPARE '+JSON.stringify({url:url.href,body:JSON.parse(init.body)}));
        return Response.json({pinArtifact:{id:'c'.repeat(64)}},{status:201});
      }
      throw Error('Unexpected network request '+url);
    };
  `;
  return { root, checkout, env, projection, network, descriptor, claims };
}

async function buildsProjectedPin(t) {
  const f = await fixture(t);
  t.after(() => rm(neutral, { recursive: true, force: true }));
  run(f.network() + materialize, f.root, f.env);
  assert.equal(git(neutral, 'rev-parse', 'HEAD^{tree}'), f.projection.treeSha);
  assert.equal(git(neutral, 'status', '--porcelain'), '');
  await assert.rejects(readFile(join(neutral, '.github/workflows/upstream.yml')));
  assert.equal(await readFile(join(neutral, 'metadata.json'), 'utf8'), '{"publisherAutomation":false}\n');
  run(projectCommands, neutral, f.env);
  const output = join(f.root, 'output'), runner = join(f.root, 'runner');
  await mkdir(runner); await writeFile(output, '');
  run(stage, neutral, { ...f.env, GITHUB_OUTPUT: output, RUNNER_TEMP: runner });
  const candidate = (await readFile(output, 'utf8')).trim().slice('directory='.length);
  const { cp } = await import('node:fs/promises');
  await cp(candidate, join(f.root, 'candidate'), { recursive: true });
  // An untrusted candidate receipt cannot introduce build-repository identity.
  await writeFile(join(f.root, 'candidate/release-provenance.json'), JSON.stringify({ repositoryId: f.claims.repository_id }));
  run(f.network() + attest, f.root, f.env);
  const receipt = JSON.parse(await readFile(join(f.root, 'accepted/release-provenance.json')));
  assert.equal(receipt.treeSha, f.projection.treeSha);
  assert.equal(receipt.sourceLockSha256, sha256(f.descriptor));
  assert.equal(receipt.sourceCommit, f.projection.sourceCommit);
  assert.equal(receipt.commitSha, f.env.GITHUB_SHA);
  assert.equal(receipt.workflowRef, f.projection.workflowRef);
  assert.equal(receipt.repositoryId, undefined);
  assert.equal(receipt.ownerId, undefined);
  assert.equal(receipt.buildInputs, undefined);
  assert.match(await readFile(join(f.root, 'accepted/payload/modules/000000'), 'utf8'), new RegExp(neutral));
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else {
        const text = await readFile(file, 'utf8');
        assert.ok(!text.includes(f.claims.repository_id));
        assert.ok(!text.includes(f.claims.repository_owner_id));
        assert.doesNotMatch(text, /rer-managed-|\b[a-f0-9]{32}\b|\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/i);
      }
    }
  }
  await inspect(join(f.root, 'accepted'));
  const result = run(f.network() + prepare, f.root, { ...f.env, ARTIFACT_ID: '56789', ARCHIVE_DIGEST: 'd'.repeat(64) });
  const request = JSON.parse(result.split('\n').find(line => line.startsWith('PREPARE ')).slice(8));
  assert.equal(new URL(request.url).pathname, '/api/delivery/broker/prepare-pin');
  assert.equal(request.body.sourceCommit, f.projection.sourceCommit);
  assert.equal(request.body.treeSha, f.projection.treeSha);
  assert.equal(request.body.installationId, undefined);
  assert.equal(request.body.environment, f.env.RELEASE_ENVIRONMENT);
  const commonBody = {
    sourceProvenance: 'project-descriptor', verificationProfile: f.env.VERIFICATION_PROFILE,
    commitSha: f.env.GITHUB_SHA, runId: f.env.GITHUB_RUN_ID, runAttempt: f.env.GITHUB_RUN_ATTEMPT,
    ref: f.env.GITHUB_REF, artifactId: '56789', archiveDigest: `sha256:${'d'.repeat(64)}`,
    artifactSha256: receipt.artifactSha256, treeSha: f.projection.treeSha, sourceLockSha256: sha256(f.descriptor),
  };
  assert.deepEqual(request.body, {
    ...commonBody, sourceRepository: f.projection.sourceRepository, sourceRepositoryId: f.projection.sourceRepositoryId,
    sourceCommit: f.projection.sourceCommit, workflowRef: f.projection.workflowRef, environment: f.env.RELEASE_ENVIRONMENT,
  });
  const ordinaryResult = run(f.network() + prepare, f.root, { ...f.env, PIN_MODE: 'false', INSTALLATION_ID: 'ordinary-installation', RELEASE_ENVIRONMENT: 'preview', ARTIFACT_ID: '56789', ARCHIVE_DIGEST: 'd'.repeat(64) });
  const ordinaryRequest = JSON.parse(ordinaryResult.split('\n').find(line => line.startsWith('PREPARE ')).slice(8));
  assert.equal(new URL(ordinaryRequest.url).pathname, '/api/delivery/broker/prepare');
  assert.deepEqual(ordinaryRequest.body, { ...commonBody, installationId: 'ordinary-installation', environment: 'preview' });
}

async function rejectsSubstitutions(t) {
  const f = await fixture(t);
  const invalid = [
    [{ sourceRepositoryId: '42' }, {}],
    [{ sourceTree: 'b'.repeat(40) }, {}],
    [{ treeSha: 'b'.repeat(40) }, {}],
    [{ generated: f.projection.generated.map((blob, i) => i ? blob : { ...blob, contentBase64: Buffer.from('tampered').toString('base64') }) }, {}],
    [{ files: [...f.projection.files, { type: 'blob', mode: '100644', sha: f.projection.files[0].sha, path: '../escape' }] }, {}],
    [{}, { GITHUB_WORKFLOW_SHA: 'e'.repeat(40) }],
  ];
  for (const [projection, env] of invalid) {
    assert.throws(() => run(f.network({ projection }) + materialize, f.root, { ...f.env, ...env }), error => /mismatch|identity|Invalid projected source entry|immutable workflow/.test(error.stderr));
  }
  await assert.rejects(readFile(join(f.checkout, 'delivery-artifact/app.json')));

  await mkdir(join(f.root, 'candidate'));
  await writeFile(join(f.root, 'candidate/app.json'), JSON.stringify({ schema: 1, deploymentSpec: { schema: 1 }, mainModule: 'worker.js', modules: [{ name: 'worker.js', type: 'esm', contentBase64: Buffer.from('export default {}').toString('base64') }], assets: [] }));
  for (const changes of [
    { claims: { workflow_sha: 'e'.repeat(40) } },
    { claims: { workflow_ref: 'other/delivery/.github/workflows/trusted-build.yml@refs/heads/main' } },
    { claims: { event_name: 'push' } },
    { projection: { sourceCommit: 'e'.repeat(40) } },
    { descriptor: JSON.stringify({ schema: 1, deployment: { target: 'untrusted' } }) },
  ]) assert.throws(() => run(f.network(changes) + attest, f.root, f.env), error => /mismatch/.test(error.stderr));
  await assert.rejects(readFile(join(f.root, 'accepted/release-provenance.json')));
}

test('pin dispatch prepares the projected artifact with its environment and rejects source or workflow substitutions', async t => {
  await buildsProjectedPin(t);
  await rejectsSubstitutions(t);
});
