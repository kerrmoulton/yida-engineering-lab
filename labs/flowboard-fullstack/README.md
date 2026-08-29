# Flowboard Full-stack Lab

该实验验证宜搭 Code Canvas 能否采用接近常规前后端项目的开发方式：前端保持多文件组件结构，通过 esbuild 生成单文件 Canvas 产物；后端使用 TypeScript + Express；浏览器经用户授权后直接访问仅监听本机的 API；前后端共享可执行的 TypeScript 数据契约。

## 目录

- `web/src/`：严格 TypeScript 的 Canvas 页面、组件、样式与 API 客户端。
- `web/preview/`：只负责挂载 Canvas 入口和显示开发状态的 Vite 壳层。
- `web/test/`：Vitest + Testing Library 组件测试和浏览器环境适配。
- `web/e2e/`：Playwright 浏览器 CRUD 与搜索回归。
- `server/src/`：Express 应用、SQLite 任务仓库与启动入口。
- `server/test/`：HTTP、CORS/PNA、校验、CRUD、持久化与重置集成测试。
- `shared/`：从 JSON Schema 自动生成、供前后端共用的任务类型与运行时解析器。
- `dist/`：构建产物，由命令生成且不进入 Git。
- `prd.md`、`design.md`：实验需求和页面设计约束。
- `results/results.json`：不含真实应用 ID 的结构化验收记录。

## 本地开发与验证

```bash
npm install
npm run dev:flowboard
```

该命令并行启动两个进程：

- Vite 本地 Canvas 预览：`http://127.0.0.1:4317`
- TypeScript API：`http://127.0.0.1:4318/api`

Vite 直接导入 `web/src/Flowboard.canvas.tsx`，不会维护另一份预览页面。保存组件或样式后由 React Fast Refresh 更新页面并尽量保留表单状态；修改 Express 或共享契约后由 `tsx watch` 自动重启 API。编译错误由 Vite 错误浮层显示，运行时渲染错误由预览壳的 Error Boundary 显示。

首次从 HTTPS 宜搭页面调用本地 API 时，浏览器可能询问是否允许该站点访问本地网络；允许后刷新页面即可继续。服务使用 `.local/flowboard/flowboard.sqlite`，热重启不会丢失数据；需要确定性初始状态时运行 `npm run reset:flowboard:db`。

另开终端运行确定性检查：

```bash
npm run typecheck:flowboard
npm run test:flowboard
npm run test:flowboard:web
npm run build:flowboard:web
npm run build:canvas
npm run contract:check
npx playwright install chromium
npm run test:flowboard:e2e
npm run test:flowboard:remote
```

配置好被 Git 忽略的 `config/targets.local.json` 后，可发布和回读独立逻辑页面，不会覆盖其他实验：

```bash
npm run guard:flowboard
npm run publish:flowboard
npm run verify:flowboard
```

## 已验证链路

- Canvas 页面读取 API 健康状态和任务列表。
- 页面新建任务，并将任务从待处理推进到进行中、已完成。
- 受控确认对话框删除任务，服务端收到 `DELETE` 并返回成功。
- 标题、说明和负责人搜索由 API 查询参数驱动。
- 页面展示最近请求 ID，服务端结构化日志记录同一个 `X-Request-Id`。
- CORS 和 Private Network Access 预检通过，API 仅监听回环地址。
- 同一份 Canvas 入口可以由 Vite 本地加载，保存后通过 HMR 更新并保留未提交输入。
- 前端作者源码、组件、API Client 和测试均通过严格 TypeScript 检查。
- Express 源码变化触发 `tsx watch` 平滑终止并重启本地服务。
- 组件测试覆盖 API 读取、任务创建和契约错误可视化反馈。
- Playwright 自动完成真实浏览器新建、两次状态推进、删除、搜索和失败清理。
- 远程只读冒烟测试复用专用 Chrome profile，自动检查真实 Canvas 首屏和 localhost API。
- SQLite 自动化测试验证进程式重开后的持久化，以及 reset/seed 的确定性。
- JSON Schema 自动生成前后端类型和轻量运行时解析器，CI 检查生成结果是否过期。
- Vite 预览把业务入口、React 核心和 UI 依赖拆分缓存；Canvas 发布文件保持不变。

实验中发现 Canvas 运行时内的浮层确认组件回调并不稳定，因此删除交互改为页面级受控 `Modal`。这项兼容性结论已固化在源码和浏览器回归结果中。
