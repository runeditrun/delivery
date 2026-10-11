import { readFile } from 'node:fs/promises';

export const workflow = await readFile(process.env.DELIVERY_WORKFLOW_FILE ?? new URL('../.github/workflows/trusted-build.yml', import.meta.url), 'utf8');
export function workflowScript(name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split(/\n      - /)[0];
  const source = step?.match(/          node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)?.[1];
  if (!source) throw new Error(`Missing workflow script: ${name}`);
  return source.replace(/^          /gm, '');
}
