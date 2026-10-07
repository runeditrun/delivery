import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const workflow = await readFile(new URL('../.github/workflows/trusted-build.yml',import.meta.url),'utf8');
const scripts = [...workflow.matchAll(/          node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/g)].map(m=>m[1].replace(/^          /gm,''));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const descriptor = {schema:1,deployment:{target:'cloudflare-workers',artifactFile:'app.json'}};
const prelude = `globalThis.fetch = async url => {
  if (String(url).includes('oidc')) return Response.json({value:'x.'+Buffer.from(JSON.stringify({job_workflow_ref:'publisher/delivery/.github/workflows/trusted-build.yml@'+'a'.repeat(40),repository_id:'1',repository_owner_id:'2'})).toString('base64url')+'.x'});
  if (String(url).includes('/git/commits/')) return Response.json({sha:'b'.repeat(40),tree:{sha:'c'.repeat(40)}});
  if (String(url).includes('rer-project.json')) return Response.json({encoding:'base64',content:Buffer.from(${JSON.stringify(JSON.stringify(descriptor))}).toString('base64')});
  throw Error('Unexpected network call');
};\n`;
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'native-delivery-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'candidate/payload/modules'),{recursive:true});
  await mkdir(join(root,'candidate/payload/assets'),{recursive:true});
  const worker = Buffer.from('export default {};\r\n');
  const asset = Buffer.from([0,255,13,10]);
  const manifest = {schema:2,deploymentSpec:{schema:1},mainModule:'worker.js',modules:[{role:'module',name:'worker.js',type:'esm',payload:'payload/modules/000000',size:worker.length,sha256:hash(worker)}],assets:[{role:'asset',path:'/image.png',contentType:'image/png',payload:'payload/assets/000000',size:asset.length,sha256:hash(asset)}]};
  await writeFile(join(root,'candidate/payload/modules/000000'),worker);
  await writeFile(join(root,'candidate/payload/assets/000000'),asset);
  const run = async () => {
    const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
    await writeFile(join(root,'candidate/app.json'),bytes);
    execFileSync(process.execPath,['--input-type=module','-e',prelude+scripts[1]],{cwd:root,env:{...process.env,BROKER_URL:'https://broker.example',ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.example?x=1',GITHUB_REPOSITORY:'publisher/app',GITHUB_SHA:'b'.repeat(40),BUILD_PROFILE:'project',ARTIFACT_FILE:'app.json',VERIFICATION_PROFILE:'full',GITHUB_RUN_ID:'3',GITHUB_RUN_ATTEMPT:'1'},stdio:'pipe'});
    return bytes;
  };
  return {root,manifest,run,worker,asset};
}
test('native schema-2 attestation preserves exact manifest and all binary payload bytes',async t=>{
  const f=await fixture(t), bytes=await f.run();
  assert.deepEqual(await readFile(join(f.root,'accepted/app.json')),bytes);
  assert.deepEqual(await readFile(join(f.root,'accepted/payload/modules/000000')),f.worker);
  assert.deepEqual(await readFile(join(f.root,'accepted/payload/assets/000000')),f.asset);
  const receipt=JSON.parse(await readFile(join(f.root,'accepted/release-provenance.json')));
  assert.equal(receipt.artifactSha256,hash(bytes));
  assert.equal(receipt.artifactSchema,2);
  assert.equal(receipt.sourceProvenance,'project-descriptor');
  assert.match(workflow,/delivery-artifact\/payload/);
});
test('native payload identities cannot redirect reads or substitute bytes',async t=>{
  for(const patch of [{payload:'../outside'},{payload:'payload/assets/000000'},{payload:'/etc/passwd'},{role:'asset'},{size:-1},{size:24*1024*1024+1},{size:0},{sha256:'0'.repeat(64)},{contentBase64:'YQ=='},{sha256:'A'.repeat(64)}]) {
    const f=await fixture(t);
    Object.assign(f.manifest.modules[0],patch);
    await assert.rejects(f.run());
  }
  const f=await fixture(t);
  await writeFile(join(f.root,'candidate/payload/assets/000000'),Buffer.from([0,254,13,10]));
  await assert.rejects(f.run());
});
test('native payload symlinks and parent-directory links fail without copying outside bytes',async t=>{
  for(const parent of [false,true]) {
    const f=await fixture(t);
    await writeFile(join(f.root,'outside'),f.worker);
    if(parent) {
      await rm(join(f.root,'candidate/payload/modules'),{recursive:true});
      await mkdir(join(f.root,'outside-directory'));
      await writeFile(join(f.root,'outside-directory/000000'),f.worker);
      await symlink('../../outside-directory',join(f.root,'candidate/payload/modules'));
    } else {
      await rm(join(f.root,'candidate/payload/modules/000000'));
      await symlink('../../../outside',join(f.root,'candidate/payload/modules/000000'));
    }
    await assert.rejects(f.run());
  }
});
