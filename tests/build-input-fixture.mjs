import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { workflowScript } from './workflow-script.mjs';

export const descriptor = { schema: 1, packageManager: 'pnpm@10.12.4', deployment: { target: 'cloudflare-workers', artifactFile: 'rer-worker-artifact.json' }, operations: { build: 'node build.mjs --mode release', verify: 'node verify.mjs' } };
export const observation = { schema: 1, runner: 'github-hosted:ubuntu-24.04', os: 'Linux', arch: 'X64', imageOS: 'ubuntu24', imageVersion: '20261001.1', osReleaseSha256: '1'.repeat(64), kernel: '6.11', nodeSha256: '2'.repeat(64), bashSha256: '3'.repeat(64), commandPath: '/usr/bin:/bin' };
const attestScript = workflowScript('Convert candidate artifact to a bounded raw-payload package and record source identity');
export async function temporary(t) {
 const root = await mkdtemp(join(tmpdir(), 'delivery-inputs-'));
 t.after(() => rm(root, { recursive: true, force: true }));
 return root;
}
export async function produce(t, changes = {}) {
 const root = await temporary(t);
 const project = changes.project ?? descriptor;
 const profile = changes.profile ?? 'project';
 const artifactFile = changes.artifactFile ?? (profile === 'project' ? project.deployment.artifactFile : 'lamp-worker-artifact.json');
 const inputs = { installation_id: 'installation', broker_url: 'https://broker.example', environment: 'preview', pnpm_version: '10.12.4', build_profile: profile, verification_profile: 'full', artifact_file: artifactFile, ...changes.inputs };
 const claims = { job_workflow_ref: 'runeditrun/delivery/.github/workflows/trusted-build.yml@' + 'a'.repeat(40), repository_id: '1', repository_owner_id: '2', ...changes.claims };
 const source = { sha: 'b'.repeat(40), tree: { sha: 'c'.repeat(40) }, ...changes.source };
 const remote = { 'rer-project.json': JSON.stringify(project), 'package.json': changes.package === null ? null : JSON.stringify(changes.package ?? {}), '.node-version': changes.nodePin ?? '26.8.1', '.nvmrc': null, 'scripts/agent-bootstrap.sh': null, 'sources.lock.json': changes.lock ?? '{"schema":1}', ...changes.files };
 const prelude = `
 const remote = ${JSON.stringify(remote)};
 globalThis.fetch = async url => {
  url = String(url);
  if (url.includes('oidc.example')) return Response.json({ value: 'x.' + Buffer.from(JSON.stringify(${JSON.stringify(claims)})).toString('base64url') + '.x' });
  if (url.includes('/git/commits/')) return Response.json(${JSON.stringify(source)});
  const name = url.match(/\\/contents\\/([^?]+)\\?ref=/)?.[1];
  if (!Object.hasOwn(remote, name)) throw Error('Unexpected network edge');
  if (remote[name] === null) return new Response(null, { status: 404 });
  return Response.json({ encoding: 'base64', content: Buffer.from(remote[name]).toString('base64') });
 };
 `;
 await mkdir(join(root, 'candidate'));
 const artifact = changes.artifact ?? { schema: 1, deploymentSpec: { schema: 1 }, mainModule: 'worker.js', modules: [{ name: 'worker.js', type: 'esm', contentBase64: Buffer.from('export default {}').toString('base64') }], assets: [] };
 await writeFile(join(root, 'candidate', artifactFile), JSON.stringify(artifact));
 // A candidate's forged receipt is never copied into accepted/.
 await writeFile(join(root, 'candidate/release-provenance.json'), JSON.stringify({ schema: 3, promotion: { eligible: true } }));
 execFileSync(process.execPath, ['--input-type=module', '-e', prelude + attestScript], { cwd: root, env: { ...process.env,
  BROKER_URL: 'https://broker.example', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example?x=1', GITHUB_REPOSITORY: changes.repository ?? 'org/app', GITHUB_SHA: source.sha,
  BUILD_PROFILE: profile, ARTIFACT_FILE: artifactFile, VERIFICATION_PROFILE: inputs.verification_profile,
  NODE_PIN: '26.8.1', NODE_VERSION: '26.8.1', NODE_VERSION_SOURCE: '.node-version', PACKAGE_MANAGER_VERSION: '10.12.4', BUILD_OBSERVATION: JSON.stringify(changes.observation ?? observation),
  WORKFLOW_INPUTS_JSON: JSON.stringify(inputs), GITHUB_RUN_ID: '3', GITHUB_RUN_ATTEMPT: '1', ...changes.env,
 }, stdio: 'pipe' });
 return JSON.parse(await readFile(join(root, 'accepted/release-provenance.json'), 'utf8'));
}
