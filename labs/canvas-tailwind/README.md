# Tailwind × OpenYida Canvas 实验

目标：用真实发布和浏览器计算样式验证两条 Tailwind 接入路线。

## 结论

1. `import 'tailwindcss'` 可以发布，默认 utility class 也会显示；但 Canvas 控制台报告 `tailwindcss is not found in dependencies map`，并由平台的 Tailwind browser runtime 接管。它适合快速原型，不应作为确定性的生产依赖方案。
2. 本地 Tailwind CLI 编译方案通过。实验使用 `lab-` 前缀和自定义 `proof` 色值，排除了平台运行时生成同名默认 utility 的干扰。发布页探针状态为 `passed`。

当前 manifest 同时保留两个独立页面，便于并排复验，互不覆盖。

## 复现

```bash
npm install
npm run experiment:tailwind:build
npm run check
npm run publish:tailwind:runtime
npm run publish:tailwind:build
npm run verify:tailwind:runtime
npm run verify:tailwind:build
```

作者维护：

- `src/TailwindRuntimeImportProbe.canvas.jsx`
- `src/TailwindBuildTimeProbe.canvas.jsx`
- `src/styles.css`
- `tailwind.config.cjs`

组件通过正常的 `import './styles.css'` 引入样式。`npm run build:canvas` 才会调用 Tailwind CLI，并在被 Git 忽略的 `labs/canvas-tailwind/dist/` 中生成 Canvas 单文件发布产物。产物里的 `GENERATED_TAILWIND_CSS` 属于编译实现，不是作者源码，不能手工修改。

Tailwind preflight 已关闭，避免页面级实验样式重置宜搭宿主页面。线上运行时只导入 `react`，不加载 `tailwindcss` npm 包。

两个页面通过 `getLabPageUrl(<逻辑页面键>)` 互相跳转。真实 `formUuid` 只存在于被 Git 忽略的 `config/targets.local.json` 和生成产物中；复制应用后不需要改页面源码。

结构化结果见 `results/results.json`。真实浏览器截图可能包含组织品牌和个人头像，只保存在本机测试证据目录，不进入公开仓库。
