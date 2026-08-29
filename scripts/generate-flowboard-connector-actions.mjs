import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, root } from './lib.mjs';

export function validateFlowboardApiContract(contract) {
  const keys = new Set();
  const actions = new Set();
  const directRoutes = new Set();
  const connectorRoutes = new Set();
  for (const operation of contract.operations || []) {
    if (keys.has(operation.key)) throw new Error(`重复 API 契约键：${operation.key}`);
    if (actions.has(operation.connector.operationId)) {
      throw new Error(`重复连接器 operationId：${operation.connector.operationId}`);
    }
    if (!/^[a-z][A-Za-z0-9]*_[a-z][A-Za-z0-9]*$/.test(operation.connector.operationId)) {
      throw new Error(`连接器 operationId 不符合 domain_action：${operation.connector.operationId}`);
    }
    const directRoute = `${operation.direct.method} ${operation.direct.path}`;
    const connectorRoute = `${operation.connector.method} ${operation.connector.path}`;
    if (directRoutes.has(directRoute)) throw new Error(`重复 Direct 路由：${directRoute}`);
    if (connectorRoutes.has(connectorRoute)) throw new Error(`重复 Connector 路由：${connectorRoute}`);
    keys.add(operation.key);
    actions.add(operation.connector.operationId);
    directRoutes.add(directRoute);
    connectorRoutes.add(connectorRoute);
  }
  return { operationCount: keys.size, actionCount: actions.size };
}

function leaf(parameter, operationId) {
  return {
    _key: `${operationId}%${parameter.name}`,
    name: parameter.name,
    paramType: parameter.type,
    desc: parameter.name,
    children: [],
    childList: [],
    __level: 0,
    hidden: false,
    required: Boolean(parameter.required),
    ...(parameter.in === 'query' ? { queryDefaultValue: { paramType: 'fixedValue', defaultValue: '' } } : {}),
  };
}

function group(name, parameters, operationId) {
  return {
    ...(name === 'Body' ? { defaultValue: '{}', desc: '请求体' } : { desc: `${name} 参数` }),
    name,
    paramType: 'Object',
    required: false,
    childList: parameters.map((parameter) => leaf(parameter, operationId)),
  };
}

export function createFlowboardConnectorActions(contract) {
  validateFlowboardApiContract(contract);
  return contract.operations.map((operation, index) => {
    const operationId = operation.connector.operationId;
    const pathParameters = operation.parameters.filter((parameter) => parameter.in === 'path');
    const queryParameters = operation.parameters.filter((parameter) => parameter.in === 'query');
    const bodyParameters = operation.parameters.filter((parameter) => parameter.in === 'body');
    const inputs = [group('Headers', [], operationId)];
    if (pathParameters.length) inputs.push(group('Path', pathParameters, operationId));
    if (queryParameters.length) inputs.push(group('Query', queryParameters, operationId));
    if (bodyParameters.length) {
      inputs.push(
        bodyParameters.length === 1 && bodyParameters[0].name === 'body'
          ? group('Body', [], operationId)
          : group('Body', bodyParameters, operationId),
      );
    }
    return {
      id: `operation-${index + 1}`,
      operationId,
      summary: operation.title,
      description: `Flowboard 实验接口：${operation.title}`,
      url: operation.connector.path.replace(/^\//, ''),
      method: operation.connector.method.toLowerCase(),
      inputs,
      parameters: {
        header: [{ name: 'Content-Type', value: 'application/json' }],
        ...(queryParameters.length
          ? {
              query: queryParameters.map((parameter) => ({
                name: parameter.name,
                type: parameter.type.toLowerCase(),
                required: Boolean(parameter.required),
                description: parameter.name,
                queryDefaultValue: { paramType: 'fixedValue', defaultValue: '' },
              })),
            }
          : {}),
        ...(bodyParameters.length ? { body: { default: '{}' } } : {}),
      },
      responses: { type: 'object', properties: {} },
      outputs: [
        {
          defaultValue: '{}',
          desc: 'Flowboard API 响应',
          name: 'Response',
          paramType: 'Object',
          required: false,
          childList: [],
        },
      ],
      origin: true,
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const contract = await readJson('contracts/flowboard-api.contract.json');
  const actions = createFlowboardConnectorActions(contract);
  const summary = validateFlowboardApiContract(contract);
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ success: true, mode: 'check', ...summary }, null, 2));
  } else {
    const output = path.join(
      root,
      '.cache/openyida/flowboard-environment-switch/connector/flowboard-actions.json',
    );
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
