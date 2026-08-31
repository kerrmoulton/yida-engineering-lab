---
version: 1.0
name: performance-operations-command-workbench
description: 面向多角色绩效运营、任务处理、批量配置和结果分析的应用级视觉设计契约
design_id: performance-operations-command-generated
design_status: ready
baseDesignSource: references/style-designs/blue-productivity-insight-workbench.md
styleDesignSelection:
  inferredUserTask: [判断, 处理, 追踪, 配置, 分析]
  inferredInformationTopology: 状态摘要优先 + 行动队列承接 + 业务列表落地 + 详情下钻
  interactionFocus: [筛选, 批量操作, 待办处理, 主从编辑, 下钻详情, 趋势比较]
  contentCompatibility:
    supports: [metrics, charts, tables, todos, filters, side_panel, timeline]
    commonComponentsAreWeakSignals: true
  layoutCompatibility: command_console_with_action_rail
  visualStyleIntent: action_command
  visualEmphasis: 行动队列和运行阻断优先，分析服务于下一步处理
  requiredVisualDNA:
    - command_filter_header
    - compact_operational_summary
    - stacked_action_rail
    - utility_record_table
    - explicit_exception_state
  selectedStyleDesign:
    name: blue-productivity-insight-workbench
    source: references/style-designs/blue-productivity-insight-workbench.md
    reason: 真实绩效系统的主要任务是发现待办、批量处理、跟踪阻断并下钻记录，行动队列比单纯趋势图更重要
  rejectedStyleDesigns:
    - soft-analytic-workbench: 均衡办公感会弱化待办、异常和批量处理的优先级
    - blue-insight-operations-dashboard: 适合结果分析页，但不足以统领配置和任务处理页
    - soft-progress-analytics-workbench: 阶段只属于期间运行页，不应成为所有页面的共同骨架
  selectionConfidence: high
scenes: [工作台, 主从管理, 任务处理, 运行控制, 结果分析]
density: high
layout: platform-navigation-multi-page-command-workbench
tone: [克制, 专业, 可扫描, 可行动, 可追踪]
tags: [绩效管理, 多角色, 批量任务, 结果分析]
avoid: [营销落地页, 低密卡片墙, 单场景演示, 全页面深色]
themeProfile:
  name: restrained-indigo
  themeScope: page
  themeColorSource: application-theme
  themePresetKey: null
  shouldPassCreateAppTheme: false
  globalThemeInjection: style#yida-global-theme
  navTheme: light
  colorMode: gradient
themeAdaptationResult:
  inputThemeColor: '#6657D9'
  strategy: replace_hue_preserve_visual_mechanism
  replaced:
    brand: '#6657D9'
    brand-strong: '#37306F'
    brand-soft: '#F0EDFF'
    focus-ring: 'rgba(102,87,217,.28)'
  preservedVisualDNA:
    - command_filter_header
    - stacked_action_rail
    - utility_record_table
  preservedMechanisms:
    - 平台导航可见的多页面结构
    - 高密筛选和批量操作工具条
    - 主工作区与右侧行动上下文
    - 细边框表格与显式状态
yidaThemeRuntime:
  globalThemeInjection: style#yida-global-theme
  formRuntimeInjection: none
  formDetailStyleInjection: none
  themeConsistency: 所有 V2 Canvas 页面消费相同的 restrained-indigo token
  styleElementId: yida-global-theme
  helperRef: yida-canvas-custom-page/references/theme-runtime-helpers.md
  injectTargets: [currentDocument, sameOriginParentDocuments]
  rootAttribute: data-yida-theme-root
tokens:
  --color-brand1-1: '#8B7CF6'
  --color-brand1-2: '#F0EDFF'
  --color-brand1-3: 'rgba(102,87,217,.22)'
  --color-brand1-5: '#7566E8'
  --color-brand1-6: '#6657D9'
  --color-brand1-7: '#5547BE'
  --color-brand1-9: '#37306F'
  --color-brand1-10: 'rgba(55,48,111,.32)'
  --color-brand-1: 'rgba(102,87,217,.24)'
  --color-brand-2: '#8B7CF6'
  --color-brand-3: '#6657D9'
  --color-brand-4: '#37306F'
  --color-group: '#6657D9,#2F8F83,#D88B45,#C05768,#6684A8,#8B7CF6'
visual_dna:
  - name: 命令与筛选头部
    confidence: observed
    evidence: 多数页面都需要年度、期间、组织筛选以及批量或主操作；来源于 command_filter_header
    rule: 页面身份在左，业务上下文筛选居中或下接，主次操作在右；不得把筛选散落到多张卡片
    implementation_hooks: [page-command, context-filters, primary-action, secondary-actions]
    failure_mode: 页面退化成标题加按钮，用户无法确认当前组织、期间和角色
  - name: 紧凑运营摘要
    confidence: inferred
    evidence: 用户需要同时判断覆盖率、待办、逾期和阻断，但首页禁止低密 KPI 卡墙
    rule: 摘要使用 64-80px 分段条或小型面板，必须包含口径、变化或下钻，不只显示孤立数字
    implementation_hooks: [metric-strip, status-pill, drilldown-link, updated-at]
    failure_mode: 首屏被四个等宽大白卡占据，信息少且无法行动
  - name: 右侧行动与阻断栏
    confidence: observed
    evidence: 工作台、运行管理、配置和任务页都有下一步、逾期、错误或完整性阻断
    rule: 右栏只在存在真实行动上下文时出现，按优先级展示阻断、待办、负责人和下一步
    implementation_hooks: [action-rail, blocker-list, next-step, owner-context]
    failure_mode: 右栏成为装饰性说明卡或大面积空白
  - name: 工具化记录表
    confidence: observed
    evidence: 组织、人员、指标、配置、实际值、绩效单、任务和结果都需要可检索多记录管理
    rule: 表格必须有筛选、计数、分页、稳定行高、状态、行操作和批量动作；详情用抽屉或主从栏保留上下文
    implementation_hooks: [table-toolbar, row-status, batch-bar, pagination, detail-drawer]
    failure_mode: 页面只能查看预设一条记录，或用大卡片代替高密管理
  - name: 显式异常状态
    confidence: inferred
    evidence: 权重错误、版本冲突、锁定阻断、退回和批量部分失败是系统真实性的关键
    rule: 成功、部分成功、阻断和失败必须展示对象级原因、requestId 和可执行恢复动作
    implementation_hooks: [result-summary, error-table, retry-action, request-id, conflict-panel]
    failure_mode: 失败只显示通用 toast，用户不知道哪些对象成功或如何恢复
colors:
  bg-outer: '#F3F4F7'
  surface: '#FFFFFF'
  surface-muted: '#F8F8FC'
  text-primary: '#18202A'
  text-secondary: '#667085'
  border-subtle: '#E4E6ED'
  brand: '#6657D9'
  success: '#218A62'
  warning: '#C47A22'
  danger: '#C84B5F'
  info: '#5577A8'
backgroundLayer:
  baseCanvas: 低饱和浅灰紫画布，平台导航可见，内容保持规则栅格
  primitives: [softTintCanvas, radialGlowWash]
  radialGlowWash: 页面左上使用低透明紫色大面积光洗，右下使用极弱青灰光洗，不使用离散圆球
  motionLayer: none
  contrastGuard: 正文、表格和控件必须保持 WCAG AA；背景装饰透明度不超过 0.1
surfaceContrast:
  rule: 浅灰画布与白色业务表面通过色差形成清晰层级
  pairing: gray-bg-white-card
  pageBackground: '#F3F4F7'
  cardBackground: '#FFFFFF'
  cardBorder: none；嵌套子面板和白底弹层使用 1px `#E4E6ED`
  forbidden: 同色背景同色卡片、只靠弱阴影、所有区块都做成相同白卡
iconSystem:
  defaultLibrary: lucide-react
  allowedLibraries: [lucide-react, '@ant-design/icons']
  style: 线性描边
  strokeWidth: 1.75
  sizes:
    toolbar: 16
    quickAction: 18
    status: 16
  actionIconMap:
    新增: Plus
    批量生成: Layers3
    导入: Upload
    导出: Download
    搜索: Search
    筛选: SlidersHorizontal
    刷新: RefreshCw
    提交: Send
    锁定: LockKeyhole
    解锁: Unlock
    重试: RotateCw
    查看: Eye
  statusIconMap:
    完成: CircleCheck
    运行中: Activity
    阻断: OctagonAlert
    逾期: ClockAlert
    退回: Undo2
    锁定: LockKeyhole
  navigationIconMap:
    工作台: LayoutDashboard
    基础资料: Database
    指标: Target
    配置: ListChecks
    填报: ClipboardPenLine
    评价: Star
    期间: CalendarRange
    结果: ChartNoAxesCombined
    审计: History
  emptyStateIconMap:
    无任务: Inbox
    无记录: FileSearch
    无权限: ShieldX
    服务错误: ServerCrash
typography:
  page-title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: 26
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: 0
  panel-title: 17px / 700 / 1.35
  body: 14px / 450 / 1.5
  caption: 12px / 450 / 1.4
  metric-number: 28-36px / 740 / tabular-nums
spacing:
  page-x: 24
  page-y: 24
  grid-gap: 16
  section-gap: 16
  card-x: 24
  card-y: 22
  row-y: 10
breathingRule:
  rhythm: 命令头与摘要间 14px，摘要与主工作区 16px，主区和右栏 16px，表格工具条与表格 10px
  sectionGap: 16
  innerPadding: 22-24
  compression: 内容少时降低面板高度或转为薄提示行；不得增加空白卡高度
rounded:
  sm: 10
  md: 14
  card: 20
  panel: 24
  pill: 999
components:
  card:
    backgroundColor: '#FFFFFF'
    rounded: 20
    padding: 22px 24px
  empty-state:
    density: compact
    maxHeight: 112
  metric-strip:
    height: 72
  action-bar:
    height: 48
  data-table:
    headerHeight: 44
    rowHeight: 52
  drawer:
    width: 'min(720px, 55vw)'
    rounded: 24
---

# 绩效运营与考评系统 Design Contract

## 1. 总览

V2 是任务驱动的真实业务系统，不是阶段展示页。所有页面先帮助用户确认角色、组织、期间和数据状态，再承接待办、批量操作、异常处理和记录下钻。紫蓝主题只用于主操作、选中态和主图序列，不染满业务表面。

系统保持宜搭平台导航，各 display 页面各自承担一个业务职责。页面内只允许当前功能的筛选、分段和主从区域，不再自绘同级应用菜单。

## 2. 风格选择依据

用户任务以处理、追踪和批量配置为主，分析图表用于发现问题而不是装饰。因此选择 `blue-productivity-insight-workbench` 的行动队列、工具表格和右侧上下文机制，再用当前应用紫蓝主题换肤。

没有选择通用柔和工作台，因为它会弱化异常与待办；没有选择纯趋势看板，因为多数页面是配置和任务处理；没有使用全局时间轴，因为阶段只属于期间运行和绩效单详情。

## 3. 主题色与换肤结果

主题来源为现有测试应用。执行“换 hue，不换 DNA；换 token，不换结构”：蓝色主操作、图表主色和 focus ring 替换为紫蓝色，浅灰画布、白色业务表面、细分割线、高密表格、行动右栏和状态语义保持不变。

主题为页面级运行时注入，不向应用创建命令传自定义 theme。根节点及同源父窗口统一维护 `style#yida-global-theme`。

## 4. 适用与不适用场景

适用：多记录管理、主从编辑、任务队列、周期运营、批量处理、异常控制、结果分析。

不适用：营销页、图片优先页面、单一长表单、全屏暗色大屏和没有真实业务动作的展示页。

## 5. 视觉氛围

专业、克制、清晰、可行动。信息密度为 high，圆角用于建立现代感和分组，不通过大留白制造“高级感”。首屏必须同时出现上下文、状态、行动和真实记录承接区。

## 6. 视觉 DNA 实施规则

1. 命令与筛选头部：所有页面显示业务标题、角色/组织/期间上下文和主次操作。
2. 紧凑运营摘要：只显示能下钻或影响决策的指标，摘要组算一个区块。
3. 行动与阻断栏：只承载真实待办、异常、负责人和下一步；没有内容时整体移除。
4. 工具化记录表：必须有筛选、计数、分页、状态、详情和批量动作。
5. 显式异常状态：批量部分失败、版本冲突和锁定阻断都展示对象级恢复路径。

## 7. 色彩角色

| 角色     | Token / 色值                   | 用途                           |
| -------- | ------------------------------ | ------------------------------ |
| 品牌主色 | `--color-brand1-6` / `#6657D9` | 主按钮、链接、选中态、主图序列 |
| 品牌浅底 | `--color-brand1-2` / `#F0EDFF` | 选中行、重点提示、浅标签       |
| 深强调   | `--color-brand1-9` / `#37306F` | 关键标题、局部重点行动面板     |
| 页面画布 | `#F3F4F7`                      | 根背景                         |
| 业务表面 | `#FFFFFF`                      | 主工作区、表格、抽屉           |
| 次级表面 | `#F8F8FC`                      | 筛选条、嵌套详情、只读块       |
| 成功     | `#218A62`                      | 完成、通过                     |
| 警告     | `#C47A22`                      | 临期、待确认、部分成功         |
| 错误     | `#C84B5F`                      | 阻断、失败、越界               |

## 8. 布局、层级与形状

- 平台导航可见；内容最大宽度 1600px，页面 padding 24px。
- 主从管理页使用 `minmax(520px,1.55fr) minmax(340px,.85fr)`；任务/工作台使用 `minmax(0,1fr) 320px`。
- 卡片间 gap 16px，小于 20px；卡片 padding 22-24px，大于 20px。
- 业务面板圆角 20px，主面板和抽屉 24px，控件 10-14px，标签 999px。
- 深度主要由浅灰画布和白色表面色差、嵌套边框及覆盖层产生；普通表格和列表不使用阴影。
- 列表行 52px，动作条 48px，状态摘要 72px，空态 88-112px。

## 9. 组件规则

### 9.1 命令栏和筛选

- 主操作 38-40px 紫蓝实底，次操作白底细边框，危险操作红色文字或确认弹窗。
- 年度、期间、组织和角色上下文使用受控 Select/Segmented，变更后同步 URL 查询参数或页面状态。
- 筛选条件可折叠但当前生效条件必须以胶囊显示，并提供单项清除和全部重置。

### 9.2 表格和主从区

- 表头 44px，数据行 52px；数值使用 `tabular-nums`，状态用颜色 + 文字 + 可选图标。
- 左侧列表保留搜索和分页；右侧详情显示对象摘要、状态、关联数据、动作和审计。
- 批量选择后出现 48px sticky 动作条，明确已选择数量和允许动作。
- 行操作最多直接显示两个，高风险和低频动作进入更多菜单。

### 9.3 行动栏和阻断

- 阻断按错误、逾期、待确认、建议顺序排列。
- 每项展示对象、原因、负责人、发生时间和处理入口。
- 没有阻断时显示不超过 88px 的健康薄条，或移除右栏，不留空卡。

### 9.4 图表

- 只在结果分析、数据填报管理、期间运行和工作台使用真实聚合图表。
- 主序列跟随品牌色，语义系列固定成功/警告/错误；单图不超过 5 个颜色。
- 图表必须显示口径、单位、时间范围、更新时间、空态和下钻动作。
- 禁止用占位图表或只有一条数据的趋势图通过验收。

### 9.5 弹窗、抽屉和反馈

- 新增/轻编辑使用 Modal；复杂关联编辑和详情使用 55vw Drawer 或页面主从栏。
- 保存失败时保留输入和弹层，不因 API 错误自动关闭。
- 批量结果使用成功/失败摘要 + 失败对象表，不只发 toast。
- 锁定、解锁、停用、作废等动作要求说明影响和二次确认；解锁/作废必须填写原因。

## 10. 快捷入口区域

工作台快捷入口使用一条 40-56px 操作工具栏，不使用图标卡阵列。条目由当前角色权限生成，最多 6 个：新建期间、维护指标、批量配置、处理填报、处理绩效单、查看结果。图标按 `iconSystem.actionIconMap`，文字始终可见。

## 11. 页面场景配方

### sceneRecipes.workbench

- rootShell：浅灰紫画布、平台导航可见、最大宽度 1600px。
- prioritySurface：今日待办和最高优先级阻断，不是标题或空 KPI。
- statusPrimitive：角色、期间、覆盖率、完成率、逾期和更新时间组成 72px 紧凑摘要。
- actionPrimitive：按权限生成的高频动作工具栏。
- contentPrimitive：待办队列、期间进度、最近批次、最近操作和结果快照。
- contextPrimitive：320px 行动栏，承载阻断、负责人和下一步。
- statePrimitive：无任务、无期间、服务失败、无权限都有薄态和明确入口。
- responsiveRule：`<1100px` 右栏下移；`<760px` 摘要两列、列表卡片化、保留最高优先级动作。

### sceneRecipes.masterData

- rootShell：24px 页面边距，顶部资料类型切换，主区为左列表 + 右详情。
- prioritySurface：当前资料类型的真实列表及数据质量状态。
- actionPrimitive：新增、导入、编辑、启停和冲突修复。
- contentPrimitive：组织树、期间表、等级区间、361 矩阵、人员与考评关系。
- contextPrimitive：引用数量、数据质量、更新时间和审计。
- statePrimitive：编码冲突、区间重叠、权重不为 100、被引用不可停用。

### sceneRecipes.managementList

- rootShell：命令筛选头 + 统计薄条 + 主列表 + 详情抽屉。
- prioritySurface：可检索业务表格和当前选择对象。
- actionPrimitive：主新增、批量启停/提交、导入导出、行级编辑。
- contentPrimitive：52px 表格、分页、状态和审计摘要。
- contextPrimitive：范围、影响对象和下一步动作。
- statePrimitive：空记录、筛选无结果、部分失败、版本冲突。

### sceneRecipes.configurationWorkbench

- rootShell：左侧员工/量化队列 + 右侧配置明细，顶部共享上下文。
- prioritySurface：当前配置的指标明细、目标和权重校验。
- actionPrimitive：批量生成、保存草稿、提交、退回、影响确认。
- contentPrimitive：受控表格、目标矩阵、人员选择、权重编辑。
- contextPrimitive：双 100 校验、组织下发锁定项、引用影响和审计。
- statePrimitive：未满 100、停用指标、无目标、并发版本冲突。

### sceneRecipes.taskWorkbench

- rootShell：左侧任务队列 + 右侧当前任务处理区。
- prioritySurface：当前必须完成的实际值、自评或考评表单。
- actionPrimitive：暂存、试算、提交、返回任务列表。
- contentPrimitive：任务列表、指标快照、评分输入、历史提交。
- contextPrimitive：截止时间、评分范围、引用人数、退回原因。
- statePrimitive：已提交只读、过期、越权、评分越界和网络失败。

### sceneRecipes.operationsConsole

- rootShell：筛选和批量命令头 + 主任务表 + 右侧阻断/批次栏。
- prioritySurface：候选/绩效单/任务运行表和准备度。
- actionPrimitive：预检、批量生成、重试、作废、核算。
- contentPrimitive：状态分布、任务进度、失败对象和详情。
- contextPrimitive：阻断原因、幂等状态、最近批次和恢复建议。
- statePrimitive：部分成功、重复生成、任务失败、作废确认。

### sceneRecipes.periodOperations

- rootShell：组织期间上下文 + 运行摘要 + 主进度区 + 右侧完整性栏。
- prioritySurface：配置、填报、评价、核算完成度和时间窗。
- actionPrimitive：启动、完整性检查、锁定、解锁、关闭。
- contentPrimitive：阶段进度、阻断对象、运行任务和事件时间线。
- contextPrimitive：锁定守卫、负责人、建议时间和结果发布状态。
- statePrimitive：未满足锁定、运行中任务、受控解锁和关闭状态。

### sceneRecipes.analyticsDashboard

- rootShell：组织期间筛选 + 结论条 + 主分布图 + 明细下钻。
- prioritySurface：等级分布和组织对比，必须来自多员工结果。
- statusPrimitive：覆盖率、平均分、中位数、已发布人数和更新时间。
- actionPrimitive：下钻、导出、切换组织/期间。
- contentPrimitive：等级分布、区间、组织对比、361 检查、个人结果表。
- contextPrimitive：口径说明、异常名单和管理建议。
- statePrimitive：样本不足、未发布、无权限和导出失败。

## 12. 状态与交互

| 状态             | 表现                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| loading          | 保留页面骨架，表格和图表局部 skeleton/spin，不闪为空页                   |
| empty            | 嵌入列表或上下文的 88-112px 薄状态，解释原因并提供创建/刷新/调整筛选动作 |
| error            | Alert + 稳定错误码 + requestId + 重试；保留已有数据和表单输入            |
| forbidden        | 展示权限边界和返回入口，不暴露被拒绝数据                                 |
| partial success  | 成功/失败计数、失败对象表、可重试动作                                    |
| version conflict | 展示服务器版本摘要，允许刷新、比较和重新编辑                             |
| locked           | 所有写控件只读，显示锁定人、时间、原因和受控解锁入口                     |
| reduced motion   | 关闭背景和阶段过渡，状态变化依靠文字、图标和颜色                         |

## 13. 响应式

- `>=1280px`：完整双栏或主从布局。
- `900-1279px`：右侧行动栏移到主列表下方，筛选工具条允许两行。
- `<900px`：主从区改为列表 → 整页详情，复杂表格横向滚动。
- `<600px`：保留个人任务、关键状态和主操作；管理型批量配置显示只读摘要并建议 PC 操作。
- 触控目标至少 44px，底部提交条在移动端 sticky。

## 14. 可访问性

- 文本与背景达到 WCAG AA；状态不能只依赖颜色。
- 图标按钮必须有 `aria-label`；表格行操作可键盘访问。
- focus ring 使用品牌透明色，不移除浏览器可见焦点。
- 图表提供摘要文本和可访问数据表入口。
- 错误信息与字段关联，屏幕阅读器可感知。

## 15. Yida Canvas 实现契约

- 实现前同时读取本文件和 `prd.md`；本文件是最终视觉事实源，不在实现阶段回读风格目录。
- 复制 `theme-runtime-helpers.md` 的 YidaCodeCanvas Helper，使用 `useYidaGlobalTheme` 同步当前文档和同源父文档。
- 根节点添加 `data-yida-theme-root="true"`；Ant Design ConfigProvider 使用同一品牌 token。
- Canvas 源码不硬编码 appType、formUuid、人员 ID 和服务地址；路由与服务通过逻辑键注入。
- 页面跳转更新最外层工作台 URL；内容区不创建应用级菜单。
- CSS 必须落实 `backgroundLayer`、`surfaceContrast`、圆角、间距、状态和响应式规则。

## 16. 必须包含

- 命令筛选头、紧凑运营摘要、真实记录表、可执行异常状态。
- 工作台和运行页在有真实任务时显示行动栏。
- 管理列表具备搜索、筛选、分页、详情和批量动作。
- 批量部分失败、版本冲突、锁定阻断和无权限状态。
- 卡片 padding 22-24px、gap 16px、业务面板圆角 20px、列表行 52px。

## 17. 禁止项

- 禁止标题 + 四个大 KPI 卡 + 图标快捷卡 + 大空态卡的低密结构。
- 禁止所有页面复用同一阶段轨道或同一个员工上下文。
- 禁止为套风格凭空增加无数据图表、右栏或时间线。
- 禁止保存失败后关闭编辑弹层或清空用户输入。
- 禁止只在当前 iframe 注入主题而漏掉同源父窗口。
- 禁止把自定义色盘名传给 `create-app --theme`。

## 18. 错误 vs 正确

| 错误                   | 正确                                      |
| ---------------------- | ----------------------------------------- |
| 工作台展示预设 94.8 分 | 工作台从多员工、多状态聚合并可下钻        |
| 所有功能围绕固定员工   | 列表选择、权限范围和 URL 状态决定当前对象 |
| 批量失败只弹“操作失败” | 展示成功/失败计数、对象和恢复动作         |
| 空右栏仍显示说明卡     | 无真实行动时移除右栏或压缩成健康薄条      |
| 保存失败后关闭 Modal   | 保留表单、显示字段/领域错误并允许修正     |

## 19. Agent 使用提示

实现页面时先从 PRD 获取业务对象、权限、数据源、页面区块和动作，再使用本文件的视觉 DNA、场景配方、token 和状态规则。`blue-productivity-insight-workbench` 只是设计来源，最终事实源是本文件。无论业务内容如何替换，都必须保留命令筛选、真实记录、行动上下文和显式异常机制。

## 20. 交付自检

- [ ] 每个页面都有真实多记录数据和明确角色任务。
- [ ] 每个 display 页面能映射到 rootShell、prioritySurface、statusPrimitive、actionPrimitive、contentPrimitive、contextPrimitive、statePrimitive 和 responsiveRule。
- [ ] 工作台没有低密 KPI 卡墙、图标卡阵列或大空态白卡。
- [ ] 页面背景与业务表面有清晰色差，不只靠阴影。
- [ ] 卡片 padding 大于 20px、gap 小于 20px、圆角在 0-32px。
- [ ] 表格、批量动作、弹层和图表状态完整。
- [ ] 紫蓝主题只改变强调色，不改变行动工作台结构。
- [ ] 空、载、错、权、冲突、部分成功和锁定状态均有恢复动作。
- [ ] 移动端保留个人任务主链路，复杂管理明确退化策略。
- [ ] 宜搭平台导航保留，跨页不产生菜单嵌套。
