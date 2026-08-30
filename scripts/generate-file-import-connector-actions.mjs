import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createFlowboardConnectorActions,
  validateFlowboardApiContract,
} from './generate-flowboard-connector-actions.mjs';
import { readJson, root } from './lib.mjs';

export function createFileImportConnectorActions(contract) {
  return createFlowboardConnectorActions(contract).map((action) => ({
    ...action,
    id: `operation-${action.operationId}`,
    description: `文件导入通道实验：${action.summary}`,
    outputs: action.outputs.map((output) => ({ ...output, desc: '文件导入实验 API 响应' })),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const contract = await readJson('contracts/file-import-api.contract.json');
  const actions = createFileImportConnectorActions(contract);
  const summary = validateFlowboardApiContract(contract);
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ success: true, mode: 'check', ...summary }, null, 2));
  } else {
    const output = path.join(root, '.cache/openyida/file-import/connector/file-import-actions.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(actions, null, 2)}\n`, 'utf8');
    console.log(
      JSON.stringify(
        { success: true, mode: 'write', output: path.relative(root, output), ...summary },
        null,
        2,
      ),
    );
  }
}
