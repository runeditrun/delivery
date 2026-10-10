import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const workflow = await readFile(new URL('../.github/workflows/trusted-build.yml', import.meta.url), 'utf8');
const selector = workflow.match(/          python3 <<'PY'\n([\s\S]*?)\n          PY/)[1].replace(/^          /gm, '');
const fallback = workflow.match(/DEFAULT_NODE_VERSION: '([^']+)'/)[1];
async function fixture(t) {
 const root = await mkdtemp(join(tmpdir(), 'delivery-node-'));
 t.after(() => rm(root, { recursive: true, force: true }));
 await mkdir(join(root, 'scripts'));
 return root;
}
async function select(root) {
 const output = join(root, 'outputs');
 await writeFile(output, '');
 execFileSync('python3', ['-c', selector], { cwd: root, env: { ...process.env, GITHUB_OUTPUT: output, DEFAULT_NODE_VERSION: fallback } });
 return Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map(line => line.split('=')));
}

test('the first exact pin wins across files, manifest fields and a literal bootstrap without executing it', async t => {
 const root = await fixture(t);
 const versions = ['20.19.5', '22.19.0', '24.8.0', '18.20.8', '16.20.2'];
 await writeFile(join(root, '.node-version'), ` v${versions[0]}\n`);
 await writeFile(join(root, '.nvmrc'), `${versions[1]}\n`);
 const manifest = { engines: { node: versions[2] }, volta: { node: `v${versions[3]}` } };
 await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
 await writeFile(join(root, 'scripts/agent-bootstrap.sh'), `touch executed\nreadonly NODE_VERSION="${versions[4]}" # literal only\n`);
 const sources = ['.node-version', '.nvmrc', 'package.json:engines.node', 'package.json:volta.node', 'scripts/agent-bootstrap.sh:NODE_VERSION'];
 for (let index = 0; index < sources.length; index++) {
  assert.deepEqual(await select(root), { version: versions[index], source: sources[index] });
  if (index < 2) await writeFile(join(root, sources[index]), 'lts/*\n');
  else if (index < 4) {
   manifest[index === 2 ? 'engines' : 'volta'].node = '>=20';
   await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  }
 }
 await assert.rejects(readFile(join(root, 'executed')));
 // Both dependency installation and the post-browser restoration use this output.
 const setupSteps = workflow.split(/      - /).filter(step => step.startsWith('uses: actions/setup-node@'));
 assert.match(setupSteps[0], /node-version: \$\{\{ steps\.node-pin\.outputs\.version \}\}/);
 assert.match(setupSteps.at(-1), /node-version: \$\{\{ steps\.node-pin\.outputs\.version \}\}/);
});

test('no pin, ranges, partial versions, aliases and dynamic bootstrap declarations use the configured fallback', async t => {
 const root = await fixture(t);
 assert.deepEqual(await select(root), { version: fallback, source: 'default' });
 for (const value of ['22', '22.20', '>=22.20.0', '^22.20.0', '~22.20.0', 'lts/*', 'latest', 'v022.20.0', '22.20.0\n24.8.0']) {
  await writeFile(join(root, '.node-version'), value);
  await writeFile(join(root, '.nvmrc'), value);
  await writeFile(join(root, 'package.json'), JSON.stringify({ engines: { node: value }, volta: { node: value } }));
  await writeFile(join(root, 'scripts/agent-bootstrap.sh'), 'NODE_VERSION="$(touch executed; echo 22.20.0)"\n');
  assert.deepEqual(await select(root), { version: fallback, source: 'default' });
 }
 await assert.rejects(readFile(join(root, 'executed')));
});
