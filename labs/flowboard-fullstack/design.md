# Flowboard Full-stack Lab Design

## Theme profile

- `themeScope`: `page`
- `themeRelation`: 跟随宜搭应用主题。
- 页面主色消费 `--color-brand1-*`；成功、警告、错误保持语义色。
- light 模式，低饱和蓝灰画布，任务状态使用浅色辅助面。

## Visual scaffold

- `rootShell`: 最大宽度 1440px，页面 padding 24px，移动端 14px。
- `backgroundLayer`: `softTintCanvas`，近白蓝灰渐变和顶部弱径向光，不使用漂浮装饰圆球。
- `prioritySurface`: 看板三列任务流是首屏主内容。
- `statusPrimitive`: 72px 紧凑状态摘要条，包含 API 状态、任务计数和最近请求 ID。
- `actionPrimitive`: 标题输入、优先级选择和新建按钮组成单行主动作区。
- `contentPrimitive`: 三列任务看板；任务行高按内容自适应但最小 92px。
- `contextPrimitive`: 右侧或下方诊断面板展示选中任务和契约状态。
- `statePrimitive`: loading、empty、error 都在原内容位置显示薄状态行，并提供重试动作。

## Surface map

- 顶部标题区无框。
- 状态摘要使用浅品牌色细线面板。
- 工具条使用半透明白色面板。
- 看板列使用白色无边框表面，与蓝灰背景形成对比。
- 任务项使用浅灰细边框，不叠加重阴影。
- 诊断区使用低对比度代码面板。

## Component recipe

- antd `ConfigProvider` 注入运行态品牌色，控件圆角 12px。
- Button、Input、Select 高度 38px。
- 面板圆角 22px，任务项圆角 16px，状态标签为胶囊。
- 卡片 padding 24px，区块 gap 16px，任务列表 gap 10px。
- 图标使用 `lucide-react`，不使用 emoji、CSS 图形或临时 SVG。

## Density and breathing

- `roundedRule`: 页面面板 22px、任务项 16px、控件 12px。
- `densityRule`: 状态摘要 72px；按钮 38px；任务项至少 92px；空态 96px。
- `breathingRule`: 页面区块 gap 16px；面板内部 padding 24px；移动端压缩到 16px。

## Responsive rule

- 宽度大于 1100px：看板与上下文区采用主次分栏。
- 720px 到 1100px：看板保持三列横向滚动，上下文移到下方。
- 小于 720px：工具条纵向排列，看板按单列状态分组。

## Acceptance checks

- 页面根节点包含 `data-yida-theme-root="true"`。
- ConfigProvider 使用运行态品牌色并设置 `getPopupContainer`。
- 主内容不是 KPI 卡阵列；任务看板承担主要工作流。
- 所有交互有 loading、empty、error 和 disabled 状态。
- 页面中不存在硬编码宜搭应用 ID、页面 ID或凭证。
