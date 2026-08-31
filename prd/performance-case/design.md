---
version: 1
design_id: performance-action-workbench-generated
baseDesignSource: references/style-designs/blue-productivity-insight-workbench.md
styleDesignSelection:
  inferredUserTask: [判断, 处理, 追踪, 核算]
  layoutCompatibility: action_rail_workspace
  visualStyleIntent: action_command
  visualEmphasis: 行动队列与阶段推进
  selectedStyleDesign: blue-productivity-insight-workbench
  selectionConfidence: high
themeProfile:
  name: restrained-indigo
  themeScope: page
  themeColorSource: business-inferred
  themePresetKey: null
  shouldPassCreateAppTheme: false
  globalThemeInjection: style#yida-global-theme
  navTheme: light
themeAdaptationResult:
  strategy: replace_hue_preserve_visual_mechanism
  preservedVisualDNA: [command_filter_header, compact_metric_strip, stacked_action_rail, utility_record_table]
density: high
layout: platform_navigation_multi_page_management_system
tone: [克制, 清晰, 可追踪, 专业]
---

# 绩效闭环工程案例设计契约

## 1. 总览

这是由六个独立宜搭 display 页面组成的高密绩效管理应用。运行总览负责判断，人员与组织、指标库负责主数据维护，配置、填报和评价页面负责业务单据执行。紫蓝只用于主操作、选中态和阶段强调，不染满页面。

## 2. 视觉 DNA

1. **命令筛选头部**：页面身份、环境标签、刷新/重置和主操作保持同层；实现钩子为 `.perf-command`。缺失时页面会退化成普通后台标题。
2. **紧凑状态条**：用 72px 高的状态摘要展示周期、配置权重、已提交数据和最终分；实现钩子为 `.perf-metrics`。禁止用四个高大白卡撑首屏。
3. **阶段主轨道**：六阶段轨道是主要视觉锚点，同时表达已完成、当前、待执行；实现钩子为 `.perf-stage-track`。
4. **右侧行动栏**：总览页承载下一步、领域约束和最近审计；功能页承载本页状态、规则和相邻页面入口。实现钩子为 `.perf-rail`，右栏必须有真实上下文。
5. **工具化明细**：人员、指标、数据与评价使用稳定行高、受控筛选、行级操作和详情弹层，不使用装饰性大卡。

## 3. 主题与色彩

页面级注入 `style#yida-global-theme`，换 hue 不换结构。

| Token               | 值                                                | 用途         |
| ------------------- | ------------------------------------------------- | ------------ |
| `--color-brand1-1`  | `#8B7CF6`                                         | hover        |
| `--color-brand1-2`  | `#F0EDFF`                                         | 选中浅底     |
| `--color-brand1-3`  | `rgba(106,90,205,.22)`                            | 品牌边界     |
| `--color-brand1-5`  | `#7566E8`                                         | 主操作 hover |
| `--color-brand1-6`  | `#6657D9`                                         | 主品牌色     |
| `--color-brand1-7`  | `#5547BE`                                         | active       |
| `--color-brand1-9`  | `#37306F`                                         | 深强调       |
| `--color-brand1-10` | `rgba(55,48,111,.32)`                             | 强调背景     |
| `--color-brand-1`   | `rgba(102,87,217,.24)`                            | 移动浅色     |
| `--color-brand-2`   | `#8B7CF6`                                         | 移动 hover   |
| `--color-brand-3`   | `#6657D9`                                         | 移动主色     |
| `--color-brand-4`   | `#37306F`                                         | 移动深色     |
| `--color-group`     | `#6657D9,#2F8F83,#D88B45,#C05768,#6684A8,#8B7CF6` | 分类色       |

画布为 `#F4F5F8`，卡片为白色无边框，使用色差形成层次（`gray-bg-white-card`）。正文 `#18202A`，次文 `#667085`，分割线 `#E6E8EF`；成功 `#218A62`、警告 `#C47A22`、错误 `#C84B5F`。

## 4. 布局与密度

- 根壳：最大宽度 1500px，页面内边距 24px，背景叠加低对比径向光洗。
- 区块 gap 16px，卡片 padding 24px，卡片圆角 22px；控件圆角 12px，标签 999px。
- 状态摘要 72px，动作条 48px，列表行 52px，薄空态不超过 104px。
- 主区为 `minmax(0, 2fr) minmax(300px, .78fr)`；右栏按页面职责承载行动、约束、审计或相邻入口。
- 呼吸节奏来自 16px 跨区块间距与 24px 组内边距；内容不足时压缩为薄行，不增加空卡高度。

## 5. 组件规则

- 主按钮：38-40px 高、紫蓝实底；次按钮白底细边框。hover/active/focus/disabled/loading 均必须可辨。
- 页面分工：功能不使用 Tabs 聚合；跨页面入口使用逻辑路由和紧凑文字按钮，平台导航仍是主导航。
- 状态标签：颜色加文字；不得只靠颜色。
- 表格/列表：52px 行高，数值右对齐，权重与分数使用等宽数字。
- 阶段轨道：已完成为实心品牌色，当前为浅底描边，待执行为中性灰。
- 图标仅使用 `lucide-react`：推进 `Play`、刷新 `RefreshCw`、重置 `RotateCcw`、指标 `Target`、数据 `Database`、评分 `Star`、锁定 `LockKeyhole`、审计 `History`。

## 6. 状态与交互

- loading：主区保持结构，局部 Spin；不闪回空白页。
- empty：列表内薄提示行并提供下一步说明。
- error：顶部 Alert 展示稳定错误码和 requestId，保留当前数据。
- locked：主操作禁用并显示锁定原因；所有模块仍可读。
- 写操作必须由点击触发；重置需要二次确认。
- `prefers-reduced-motion` 下关闭阶段轨道与背景过渡。

## 7. 响应式和可访问性

- `<1100px`：右栏移到主区下方；`<760px`：状态条两列、工具栏换行、明细横向滚动。
- 触控目标至少 44px；纯图标按钮提供 `aria-label`；焦点环不被移除。
- 文本与背景达到 WCAG AA；状态必须同时有文字或图标。

## 8. 实现适配与验收

- Canvas 根节点必须带 `data-yida-theme-root="true"`。
- 页面使用 React、Ant Design 与 lucide-react；不得读取凭证或硬编码真实应用/人员 ID。
- Vite 与 Canvas 加载同一 `.canvas.tsx`；本地 preview 只提供挂载壳。
- 总览首屏至少包含命令头、状态条、阶段轨道、主内容、右侧行动和审计六层信息；功能页至少包含命令头、状态摘要、业务明细、规则反馈和相邻入口。不得出现低密 KPI 卡墙或空右栏。

## 9. 页面场景配方

### visualScaffold.workbench

- rootShell：浅灰紫画布、平台导航可见、最大宽度 1500px。
- prioritySurface：当前绩效方案与阶段轨道，不使用空 KPI 墙。
- statusPrimitive：64-88px 紧凑摘要条。
- actionPrimitive：当前待处理动作与刷新工具条。
- contentPrimitive：方案事实、阶段、审计列表。
- contextPrimitive：主数据健康、约束和下一步建议。
- statePrimitive：接口错误、无方案和本地服务未启动均提供薄提示与明确动作。

### visualScaffold.list

- rootShell：页面边距 24px，浅灰画布 + 白色主表面。
- prioritySurface：搜索筛选工具条与真实主数据表格。
- actionPrimitive：右上主新增、行级编辑/启停；删除或停用需要确认。
- contentPrimitive：52px 行高表格、分页/计数、状态标签。
- contextPrimitive：右侧或顶部口径说明，不占用大面积空白。
- statePrimitive：列表内 88-104px 薄空态、加载骨架、稳定错误码。

### visualScaffold.splitPane

- rootShell：主工作区 `2fr` + 右侧上下文 `.78fr`。
- prioritySurface：可编辑方案、评价矩阵或核算结果。
- actionPrimitive：固定在主面板底部的提交条。
- contentPrimitive：受控表单、可横向滚动的业务表格。
- contextPrimitive：权重校验、员工组织上下文、领域约束和审计。
- statePrimitive：只读、锁定、越界和阶段不匹配都显示文字原因。

所有场景继续执行：页面 gap 16px（小于 20px），面板 padding 24px（大于 20px），业务面板圆角 22px，控件圆角 12px，状态摘要 72px，列表行 52px，空态不超过 104px。
