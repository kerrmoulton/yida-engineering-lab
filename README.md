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

当前已完成的实验见 [Canvas Tailwind Lab](labs/canvas-tailwind/README.md)。完整目录演进规则见 [仓库架构](docs/architecture.md)。

## 本地配置

仓库不提交真实应用 ID、页面 ID、登录态或远端 Schema。首次使用时复制示例配置：

```bash
cp config/targets.example.json config/targets.local.json
```

然后填写自己有权限操作的测试应用，以及每个逻辑页面键对应的 display 页面 `formUuid`。`config/targets.local.json` 已被 Git 忽略。本地格式、Lint、契约、单测和构建不依赖真实目标；只有远端守卫、发布和回读要求该配置。

`manifest.json` 管理可读且稳定的页面键，例如 `tailwind.runtime`；本地配置只管理环境相关的真实 ID。页面源码通过 `getLabPageUrl('tailwind.runtime')` 引用其他页面，构建产物才会注入当前应用的实际路由。因此复制应用后只需更换本地映射，不需要修改源码。

## 常用命令

```bash
npm install
npm run check
npm run build:canvas
npm run guard:live -- --page tailwind.runtime
npm run publish:test -- --page tailwind.runtime
npm run verify:remote -- --page tailwind.runtime
```

本地检查会遍历 manifest 中的全部页面；守卫、发布和远端回读必须用 `--page` 明确指定一个逻辑页面，避免误覆盖。发布会先检查线上漂移，再执行 Canvas 发布和健康检查，最后为该页面单独更新本机基线。检测到线上内容偏离基线时会停止，不自动覆盖远端。

日常开发只修改 `labs/*/src/`。生成目录、登录缓存、本地目标配置和真实发布基线均不进入 Git。
