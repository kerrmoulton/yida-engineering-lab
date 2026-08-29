# Repository Architecture

本仓库采用“实验、共享能力、发布产物”分层，避免某个验证项目逐渐演变成不可拆分的单体。

## Labs

每个目录验证一个边界清晰的工程问题，至少包含目标、复现命令、验收标准和结构化结果。实验可以依赖根目录工具，但不直接依赖其他实验的内部文件。

计划中的实验包括：

- `canvas-tailwind`：验证运行时样式框架与本地静态 CSS 构建。
- `flowboard-fullstack`：验证 Canvas、多文件前端工程与 localhost TypeScript API 联调。
- `canvas-components`：验证第三方组件和宜搭运行态组件兼容性。
- `data-binding`：验证表单数据桥、字段契约和错误处理。
- `realtime`：验证 SSE 或 WebSocket 等长连接能力。

## Shared capabilities

当一项能力在至少一个 Lab 中通过可重复验收后，再提取到 `packages/`。候选能力包括 Canvas bundler、API client、契约工具、发布守卫和浏览器测试 harness。

## Publish boundary

`labs/*/src/` 是作者源码边界，允许使用多文件 JSX/TSX、普通 CSS import 和测试。`labs/*/dist/` 是各 Lab 的发布边界：构建工具把作者源码、Tailwind 产物和必要适配封装成 Canvas 可接受的单文件源码，再由发布守卫写入远端。

生成目录被 Git 忽略，不接受人工编辑。公开仓库中的事实来源永远是 Lab 作者源码、样式入口、构建配置和构建工具。

## Application and page identity

`manifest.json` 用稳定的逻辑键描述应用和页面，不保存某个组织中的真实资源 ID。一个 Lab 可以声明多个页面，每个页面都有独立源码、构建方式、发布目标和远端基线。`config/targets.local.json` 将这些逻辑键映射为当前测试环境的 `appType` 与 `formUuid`。

源码中的跨页导航通过虚拟模块 `@yida-lab/runtime` 的 `getLabPageUrl(pageKey)` 表达。构建器把虚拟模块替换为当前环境的路由表；作者源码不包含 `formUuid`。应用被复制或迁移后，只需更新本地映射。远端命令要求显式传入 `--page <key>`，本地检查则遍历全部页面。

根目录的 `project/` 不是业务项目，也不存放 Lab 源码。它是 OpenYida CLI 的兼容工作区：`project/config.json` 让 CLI 从仓库根稳定识别项目根，`project/.cache/` 承载本机登录指针和运行缓存。删除整个目录会改变 CLI 的工作区解析结果，因此只保留这层最小适配。

真实应用标识、登录态、远端基线和浏览器环境截图属于本机证据，不进入公开仓库。
