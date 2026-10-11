import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename, symlink, link, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { workflowScript } from './workflow-script.mjs';

const script = workflowScript('Validate and stage producer package');
async function fixture(t, schema = 2) {
  const home = await mkdtemp(join(tmpdir(), 'producer-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const cwd = join(home, 'workspace'), temp = join(home, 'runner');
  await mkdir(join(cwd, 'delivery-artifact'), { recursive: true });
  await mkdir(temp);
  const worker = Buffer.from('export default {};\r\n');
  const manifest = { schema, deploymentSpec: { schema: 1 }, mainModule: 'worker.js', modules: [{ name: 'worker.js', type: 'esm', contentBase64: worker.toString('base64') }], assets: [] };
  const expected = new Map();
  if (schema === 2) {
    await mkdir(join(cwd, 'delivery-artifact/payload/modules'), { recursive: true });
    await mkdir(join(cwd, 'delivery-artifact/payload/assets'));
    expected.set('payload/modules/000000', worker);
    const asset = Buffer.from([0, 255, 10, 13, 0]);
    expected.set('payload/assets/000000', asset);
    const identity = bytes => ({ size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    manifest.modules = [{ role: 'module', name: 'worker.js', type: 'esm', payload: 'payload/modules/000000', ...identity(worker) }];
    manifest.assets = [{ role: 'asset', path: '/binary', contentType: 'application/octet-stream', payload: 'payload/assets/000000', ...identity(asset) }];
  }
  expected.set('app.json', Buffer.from(`${JSON.stringify(manifest)}\n`));
  for (const [path, bytes] of expected) await writeFile(join(cwd, 'delivery-artifact', path), bytes);
  const output = join(home, 'output'), trace = join(home, 'opens');
  await writeFile(output, '');
  await writeFile(trace, '');
  return { home, cwd, temp, output, trace, expected, path: name => join(cwd, 'delivery-artifact', name) };
}
async function run(f, { artifact = 'app.json', hook = '', openedHook = '', runnerTemp = f.temp } = {}) {
  // Observe real fs calls at the child boundary, retaining the actual filesystem.
  const preload = join(f.home, 'observe.mjs');
  await writeFile(preload, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const originalOpen = fs.open;
fs.open = async (path, flags, ...args) => {
  if (String(path).startsWith('delivery-artifact')) {
    await fs.appendFile(${JSON.stringify(f.trace)}, String(path) + '\\n');
    ${hook}
  }
  const handle = await originalOpen.call(fs, path, flags, ...args);
  if (String(path).startsWith('delivery-artifact')) { ${openedHook} }
  return handle;
};
syncBuiltinESMExports();`);
  return spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', script], {
    cwd: f.cwd, env: { ...process.env, ARTIFACT_FILE: artifact, RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: f.output },
    encoding: 'utf8', timeout: 5000,
  });
}
async function refused(f, result, path, type, { unopened = true } = {}) {
  assert.equal(result.error, undefined, `child must finish without timeout: ${result.error}`);
  assert.equal(result.status, 1, result.stderr);
  if (unopened) assert.equal(await readFile(f.trace, 'utf8'), '', 'inventory rejects before any producer file is opened');
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.ok(lines[0].includes(JSON.stringify(path)), result.stderr);
  assert.match(lines[0], type);
  assert.match(lines[0], /copy the file into delivery-artifact\/payload instead of linking it/);
  assert.equal(await readFile(f.output, 'utf8'), '', 'failed snapshot must not publish upload output');
  assert.deepEqual(await readdir(f.temp), [], 'failed snapshot must be removed');
}
for (const schema of [1, 2]) test(`producer schema-${schema} stages byte-identical files in a fresh external tree`, async t => {
  const f = await fixture(t, schema), result = await run(f);
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(f.output, 'utf8');
  const stage = output.match(/^directory=(.+)\n$/)?.[1];
  assert.ok(stage && isAbsolute(stage));
  assert.equal(relative(await realpath(f.temp), stage).split('/').length, 1);
  assert.ok(relative(await realpath(f.cwd), stage).startsWith('..'));
  const staged = new Map();
  async function collect(path = '') {
    for (const name of await readdir(join(stage, path))) {
      const next = join(path, name), stat = await lstat(join(stage, next));
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) await collect(next);
      else { assert.equal(stat.nlink, 1); staged.set(next, await readFile(join(stage, next))); }
    }
  }
  await collect();
  assert.deepEqual(staged, f.expected);
  for (const [path] of f.expected) {
    const source = await lstat(f.path(path)), copy = await lstat(join(stage, path));
    assert.ok(source.dev !== copy.dev || source.ino !== copy.ino, 'snapshot owns a new file');
    await writeFile(f.path(path), 'producer changed after validation');
    assert.deepEqual(await readFile(join(stage, path)), f.expected.get(path));
  }
});

test('producer rejects unsafe and reserved artifact filenames before accessing content', async t => {
  for (const artifact of ['../app.json', '/app.json', 'a/b.json', 'a\\b.json', '.app.json', 'app.JSON', 'release-provenance.json', 'app\n.json', '']) {
    const f = await fixture(t);
    await writeFile(join(f.cwd, 'app.json'), 'outside manifest bytes');
    await writeFile(f.path('release-provenance.json'), 'reserved manifest bytes');
    await refused(f, await run(f, { artifact }), artifact, /invalid artifact filename/);
  }
  const f = await fixture(t);
  await rename(f.path('app.json'), f.path('A_1.-artifact.json'));
  assert.equal((await run(f, { artifact: 'A_1.-artifact.json' })).status, 0);
});

test('producer rejects symbolic links at every upload boundary and nested entry before opening content', async t => {
  for (const path of ['', 'app.json', 'payload', 'payload/modules', 'payload/modules/000000']) {
    for (const target of ['outside', 'inside', 'dangling']) {
      const f = await fixture(t), selected = f.path(path);
      const saved = target === 'inside' && path ? f.path('saved') : join(f.home, 'saved');
      await rename(selected, saved);
      await symlink(target === 'dangling' ? join(f.home, 'missing') : saved, selected);
      await refused(f, await run(f), join('delivery-artifact', path), /symbolic link/);
    }
  }
  const f = await fixture(t);
  await symlink('missing', f.path('payload/line\nbreak'));
  await refused(f, await run(f), 'delivery-artifact/payload/line\nbreak', /symbolic link/);
});

test('producer rejects hard-linked manifest and payload files before opening content', async t => {
  for (const path of ['app.json', 'payload/modules/000000']) {
    const f = await fixture(t);
    await link(f.path(path), join(f.home, 'second-link'));
    await refused(f, await run(f), `delivery-artifact/${path}`, /hard-linked regular file/);
  }
});

test('producer requires directory package and payload roots and a regular manifest', async t => {
  for (const [path, isDirectory] of [['', false], ['payload', false], ['app.json', true]]) {
    const f = await fixture(t);
    await rm(f.path(path), { recursive: true });
    if (isDirectory) await mkdir(f.path(path)); else await writeFile(f.path(path), 'regular bytes');
    await refused(f, await run(f), join('delivery-artifact', path), isDirectory ? /directory where a regular file is required/ : /regular file where a directory is required/);
  }
});

for (const special of ['named pipe', 'socket', 'character device', 'block device']) test(`producer refuses ${special} without opening it`, async t => {
  for (const path of ['', 'app.json', 'payload', 'payload/modules/special']) {
    const f = await fixture(t), selected = f.path(path);
    await rm(selected, { force: true, recursive: true });
    let server;
    if (special === 'socket') {
      server = createServer();
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(join(f.home, 'socket'), resolve); });
      await rename(join(f.home, 'socket'), selected);
    } else {
      const command = special === 'named pipe' ? 'mkfifo' : 'sudo';
      const args = special === 'named pipe' ? [selected] : ['-n', 'mknod', selected, special === 'character device' ? 'c' : 'b', '1', '3'];
      const creation = spawnSync(command, args, { encoding: 'utf8', timeout: 3000 });
      if (creation.status !== 0) {
        if (special === 'named pipe') assert.fail(`mkfifo unavailable: ${creation.stderr}`);
        t.skip(`noninteractive ${special} creation unavailable (${creation.stderr.trim() || creation.error}); pipe and socket exercise the same nonregular branch`);
        return;
      }
    }
    try { await refused(f, await run(f), join('delivery-artifact', path), new RegExp(special)); }
    finally {
      if (server) await new Promise(resolve => server.close(resolve));
      await rm(selected, { force: true });
    }
  }
});

test('producer detects leaf inode substitution and removes a partly copied snapshot', async t => {
  const f = await fixture(t);
  const hook = `if (String(path).endsWith('/modules/000000')) { await fs.rename(path, path + '.old'); await fs.writeFile(path, 'substituted bytes'); }`;
  await refused(f, await run(f, { hook }), 'delivery-artifact/payload/modules/000000', /file changed during staging/, { unopened: false });
});

test('producer refuses a leaf symlink substituted at open without reading its target', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, 'outside'), 'outside bytes');
  const hook = `if (String(path).endsWith('/modules/000000')) { await fs.rename(path, path + '.old'); await fs.symlink(${JSON.stringify(join(f.home, 'outside'))}, path); }`;
  await refused(f, await run(f, { hook }), 'delivery-artifact/payload/modules/000000', /ELOOP/, { unopened: false });
});

test('producer refuses a FIFO substituted at open without blocking', async t => {
  const f = await fixture(t);
  const hook = `if (String(path).endsWith('/modules/000000')) { await fs.rename(path, path + '.old'); const { execFileSync } = await import('node:child_process'); execFileSync('mkfifo', [path]); }`;
  await refused(f, await run(f, { hook }), 'delivery-artifact/payload/modules/000000', /named pipe/, { unopened: false });
});

test('producer detects directory substitution even when the leaf inode stays the same', async t => {
  const f = await fixture(t);
  const hook = `if (String(path).endsWith('/modules/000000')) { await fs.rename('delivery-artifact/payload/modules', 'delivery-artifact/payload/old'); await fs.mkdir('delivery-artifact/payload/modules'); await fs.rename('delivery-artifact/payload/old/000000', path); }`;
  await refused(f, await run(f, { hook }), 'delivery-artifact/payload/modules', /directory changed during staging/, { unopened: false });
});

test('producer rechecks the opened file link count after inventory', async t => {
  const f = await fixture(t);
  const hook = `if (String(path).endsWith('/modules/000000')) await fs.link(path, ${JSON.stringify(join(f.home, 'second-link'))});`;
  await refused(f, await run(f, { hook }), 'delivery-artifact/payload/modules/000000', /hard-linked regular file/, { unopened: false });
});


test('producer rejects content changes while copying and discards the snapshot', async t => {
  const f = await fixture(t);
  const openedHook = `if (String(path).endsWith('/modules/000000')) {
    const originalRead = handle.readFile.bind(handle);
    handle.readFile = async (...args) => {
      const bytes = await originalRead(...args);
      await fs.writeFile(path, 'changed producer bytes during copy');
      return bytes;
    };
  }`;
  await refused(f, await run(f, { openedHook }), 'delivery-artifact/payload/modules/000000', /file changed during staging/, { unopened: false });
});


test('producer refuses staging locations inside the workspace or without an absolute runner path', async t => {
  for (const location of ['inside', 'relative', 'missing']) {
    const f = await fixture(t);
    await mkdir(join(f.cwd, 'runner'));
    const runnerTemp = location === 'inside' ? join(f.cwd, 'runner') : location === 'relative' ? '../runner' : '';
    await refused(f, await run(f, { runnerTemp }), runnerTemp, /RUNNER_TEMP/);
    assert.deepEqual(await readdir(join(f.cwd, 'runner')), []);
  }
});
