# Yida Engineering Lab

Yida Engineering Lab 是面向宜搭 Code Canvas 的可复用工程能力实验仓库。每个 Lab 用可执行代码、自动化检查和结构化证据验证一项能力；验证成熟的能力再沉淀为共享工具，供后续实验和真实项目复用。

## 仓库分层

- `labs/`：相互隔离的能力实验及其复现说明。
- `labs/*/dist/`：各 Lab 构建产生的单文件 Canvas 发布产物，不进入 Git。
- `project/`：OpenYida CLI 工作区适配层，只保留平台配置和忽略缓存。
- `contracts/`：源码和发布产物必须满足的确定性契约。
- `scripts/`：构建、检查、远端漂移守卫、发布和回读工具。
- `tests/`：不访问真实环境的工具单元测试。
- `release/`：本机生成的远端基线；真实基线不会进入 Git。

当前已完成的实验包括 [Canvas Tailwind Lab](labs/canvas-tailwind/README.md) 和 [Flowboard Full-stack Lab](labs/flowboard-fullstack/README.md)。完整目录演进规则见 [仓库架构](docs/architecture.md)。

## 本地配置

本实验使用 Node.js 24 或更高版本，SQLite 直接采用 Node 内置的 `node:sqlite`，不需要额外安装本地数据库服务或原生 npm 驱动。

仓库不提交真实应用 ID、页面 ID、登录态或远端 Schema。首次使用时复制示例配置：

```bash
cp config/targets.example.json config/targets.local.json
```

然后填写自己有权限操作的测试应用、浏览器自动化使用的测试组织，以及每个逻辑页面键对应的 display 页面 `formUuid`。`config/targets.local.json` 已被 Git 忽略，真实组织、应用、页面和连接器标识都不会进入仓库。本地格式、Lint、契约、单测和构建不依赖真实目标；只有远端守卫、发布和回读要求该配置。

`manifest.json` 管理可读且稳定的页面键，例如 `tailwind.runtime`；本地配置只管理环境相关的真实 ID。页面源码通过 `getLabPageUrl('tailwind.runtime')` 引用其他页面，构建产物才会注入当前应用的实际路由。因此复制应用后只需更换本地映射，不需要修改源码。

## 常用命令

```bash
npm install
npm run check
npm run check:full
npm run build:canvas
npm run dev:flowboard
npm run reset:flowboard:db
npm run test:flowboard:web
npm run test:flowboard:e2e
npm run test:flowboard:remote
npm run test:flowboard:remote:direct
npm run test:flowboard:remote:connector
npm run tunnel:flowboard
npm run guard:live -- --page tailwind.runtime
npm run publish:test -- --page tailwind.runtime
npm run verify:remote -- --page tailwind.runtime
```

`npm run dev:flowboard` 会同时启动 Vite Canvas 预览和可自动重启的 TypeScript API：页面位于 `http://127.0.0.1:4317`，API 位于 `http://127.0.0.1:4318/api`。本地预览直接加载同一份 `.canvas.tsx` 作者源码并支持 HMR；API 使用 `.local/flowboard/flowboard.sqlite` 持久化数据，`npm run reset:flowboard:db` 可恢复三条确定性种子任务。发布到宜搭后的联调仍需允许该域名访问本地网络。

首次运行浏览器 E2E 前执行 `npx playwright install chromium`。`npm run check` 运行不依赖浏览器的格式、Lint、类型、单测和构建检查；`npm run check:full` 在此基础上增加 Playwright 本地全链路测试。

`npm run test:flowboard:remote:direct` 和 `npm run test:flowboard:remote:connector` 会启动本地 API，并用独立且被 Git 忽略的 Chrome profile 打开真实宜搭页面，分别验证 localhost 与宜搭连接器。脚本会复用 profile；统一认证已识别身份时，还会根据本地 `browserAuth.organization` 配置点击登录并选择明确组织。密码、扫码、验证码和 CAPTCHA 始终留给人工处理。测试会自动授予页面本地网络访问权限，并把截图与结构化证据写入 `.cache/playwright/flowboard/`。

Flowboard 的任务字段契约以 `contracts/flowboard-task.schema.json` 为唯一事实源。修改字段后运行 `npm run contract:generate`；`npm run check` 会通过 `contract:generated:check` 阻止过期的 TypeScript 类型和运行时解析器进入提交。

`build:flowboard:web` 只优化本地 Vite 预览：业务入口、React 核心和 UI 依赖会生成独立 chunk。Canvas 发布仍从 `.canvas.tsx` 经 `build:canvas` 生成单文件源码，并把 React、antd、lucide-react 保持为平台 `importedModules`；两条构建链路互不读取对方产物。

本地检查会遍历 manifest 中的全部页面；守卫、发布和远端回读必须用 `--page` 明确指定一个逻辑页面，避免误覆盖。发布会先检查线上漂移，再执行 Canvas 发布和健康检查，最后为该页面单独更新本机基线。检测到线上内容偏离基线时会停止，不自动覆盖远端。

日常开发只修改 `labs/*/src/`。生成目录、登录缓存、本地目标配置和真实发布基线均不进入 Git。
