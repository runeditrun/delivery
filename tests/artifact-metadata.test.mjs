import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { workflowScript } from './workflow-script.mjs';

const script = workflowScript('Validate final trusted archive size');
const metadata = { id: 12345, digest: `sha256:${'a'.repeat(64)}`, size_in_bytes: 3069901 };
function validate(responses) {
  // Execute the actual inline program; fake only GitHub and advance its clock.
  const prelude = `
    import { mock } from 'node:test';
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1794182400000 });
    let ticker;
    const started = Date.now();
    const tick = () => { mock.timers.tick(100); ticker = setImmediate(tick); };
    ticker = setImmediate(tick);
    const responses = ${JSON.stringify(responses)};
    let reads = 0;
    globalThis.fetch = async (url, init) => {
      console.log('READ ' + JSON.stringify({ url, at: Date.now(), signal: Boolean(init.signal), method: init.method ?? 'GET' }));
      const answer = responses[Math.min(reads++, responses.length - 1)];
      if (answer.latency) await new Promise(resolve => setTimeout(resolve, answer.latency));
      if (answer.transport) throw new TypeError('synthetic connection reset');
      if (answer.stall) return new Promise(() => {}); // Even an uncooperative fetch is bounded.
      if (answer.bodyStall) return new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }, { highWaterMark: 0 }));
      const headers = answer.dateAfter ? { 'retry-after': new Date(Date.now() + answer.dateAfter * 1000).toUTCString() } : answer.headers;
      return new Response(answer.raw ?? JSON.stringify('body' in answer ? answer.body : ${JSON.stringify(metadata)}), { status: answer.status ?? 200, headers });
    };
    try {
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', prelude + script + '\n} finally { console.log("ELAPSED " + (Date.now() - started)); clearImmediate(ticker); mock.timers.reset(); }'], {
    env: { ...process.env, GH_TOKEN: 'synthetic-token', GITHUB_REPOSITORY: 'org/app', ARTIFACT_ID: '12345', ARCHIVE_DIGEST: 'a'.repeat(64) },
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  const reads = result.stdout.split('\n').filter(line => line.startsWith('READ ')).map(line => JSON.parse(line.slice(5)));
  assert.ok(reads.every(read => read.url === 'https://api.github.com/repos/org/app/actions/artifacts/12345' && read.signal && read.method === 'GET'), output);
  return { ok: result.status === 0, output, reads, elapsed: Number(result.stdout.match(/ELAPSED (\d+)/)?.[1]) };
}
test('404 immediately after upload retries the same artifact and succeeds', () => {
  const result = validate([{ status: 404 }, {}]);
  assert.equal(result.ok, true, result.output);
  assert.equal(result.reads.length, 2);
  assert.equal(result.reads[1].at - result.reads[0].at, 1000);
  assert.match(result.output, /Trusted artifact archive size: 3069901 bytes/);
});
test('persistent 404 and 5xx exhaust the attempt or time budget with the last HTTP reason', () => {
  for (const answer of [{ status: 404 }, { status: 503 }, { status: 503, latency: 4500 }]) {
    const result = validate([answer]);
    assert.equal(result.ok, false, result.output);
    assert.match(result.output, new RegExp(`retry exhausted after ${result.reads.length}/8 attempts .*last HTTP ${answer.status}; last failure: (HTTP ${answer.status}|transport TimeoutError)`));
    assert.ok(result.reads.length <= 8);
    assert.ok(result.elapsed <= 60000);
    if (!answer.latency) assert.equal(result.reads.length, 8);
    assert.doesNotMatch(result.output, /archive exceeds size limit/);
  }
});
test('401 and 403 refuse immediately without retry', () => {
  for (const status of [401, 403]) {
    const result = validate([{ status }, {}]);
    assert.equal(result.ok, false);
    assert.equal(result.reads.length, 1);
    assert.match(result.output, new RegExp(`GitHub artifact metadata HTTP ${status} after 1 attempt`));
  }
});
test('over-limit metadata refuses once with measured and allowed bytes', () => {
  const result = validate([{ body: { ...metadata, size_in_bytes: 67108865 } }, {}]);
  assert.equal(result.ok, false);
  assert.equal(result.reads.length, 1);
  assert.match(result.output, /archive exceeds size limit: 67108865 bytes; allowed 67108864 bytes/);
});
test('under-limit and exactly 64 MiB metadata succeed with their byte counts', () => {
  for (const size_in_bytes of [3069901, 67108864]) {
    const result = validate([{ body: { ...metadata, size_in_bytes } }]);
    assert.equal(result.ok, true, result.output);
    assert.equal(result.reads.length, 1);
    assert.match(result.output, new RegExp(`Trusted artifact archive size: ${size_in_bytes} bytes`));
  }
});
test('transport and 429 retry with bounded Retry-After; stalled reads and bodies expire', () => {
  for (const [answer, delay] of [[{ transport: true }, 1000], [{ status: 429, headers: { 'retry-after': '3' } }, 3000], [{ status: 429, headers: { 'retry-after': '999' } }, 10000], [{ status: 429, dateAfter: 4 }, 4000]]) {
    const result = validate([answer, {}]);
    assert.equal(result.ok, true, result.output);
    assert.equal(result.reads.length, 2);
    assert.equal(result.reads[1].at - result.reads[0].at, delay);
  }
  for (const answer of [{ stall: true }, { bodyStall: true }]) {
    const result = validate([answer]);
    assert.equal(result.ok, false);
    assert.match(result.output, /retry exhausted after \d+\/8 attempts .*last HTTP (none|200); last failure: transport TimeoutError/);
    assert.ok(result.reads.length <= 8);
    assert.ok(result.elapsed <= 60000);
  }
});
test('invalid size, artifact identity or JSON fails closed without retry', () => {
  for (const body of [null, { ...metadata, id: 999 }, { ...metadata, digest: `sha256:${'b'.repeat(64)}` }, ...[-1, 1.5, '3069901', Number.MAX_SAFE_INTEGER + 1, null].map(size_in_bytes => ({ ...metadata, size_in_bytes }))]) {
    const result = validate([{ body }]);
    assert.equal(result.ok, false);
    assert.equal(result.reads.length, 1);
    assert.match(result.output, /identity does not match|size is unavailable/);
  }
  const result = validate([{ raw: '{' }]);
  assert.equal(result.ok, false);
  assert.equal(result.reads.length, 1);
  assert.match(result.output, /SyntaxError/);
});
