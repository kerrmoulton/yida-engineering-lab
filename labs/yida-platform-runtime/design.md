# 宜搭平台运行时实验设计

## 1. 实验问题

本实验回答四个问题：

1. Canvas 当前窗口、父窗口和顶层窗口分别注入了哪些宜搭上下文？
2. `window.Deep`、`window.DeepYida`、`window.YidaNativeComponents` 中有哪些可渲染组件？
3. 哪些官方页面 JS API 可以通过窄接口桥接给 Canvas？
4. 表单和流程能力如何在不影响其他用户的前提下形成真实回归测试？

实验结论必须来自两类证据：官方文档用于确认公开契约，真实宜搭页面用于确认当前租户、页面类型和客户端中的实际兼容性。

## 2. 能力分级

| 等级          | 含义                                       | 业务使用策略                   |
| ------------- | ------------------------------------------ | ------------------------------ |
| `official`    | 宜搭官方文档明确公开                       | 仍做存在性检查，通过适配层使用 |
| `observed`    | 真实页面中发现，但没有稳定公开契约         | 只能作为渐进增强               |
| `verified`    | 已完成真实挂载或安全调用                   | 可在当前兼容矩阵范围内使用     |
| `unstable`    | 可用但依赖内部对象、窗口层级或未公开 props | 必须保留 fallback              |
| `unsupported` | 缺失、挂载失败或行为不满足验收条件         | 不进入业务能力层               |

`window.pageConfig`、`window.loginUser`、外层页面 `this.utils.*` 和 `this.utils.yida.*` 从官方契约开始验证。`window.Deep`、`window.DeepYida`、`window.YidaNativeComponents`、`window.__YIDA__`、`window.YIDA_CONFIG` 和 `window.g_config` 从观察级开始，不能因为对象存在就升级为稳定能力。

## 3. 工程边界

业务代码只依赖平台端口，不直接依赖全局对象：

```text
Canvas business code
  -> YidaPlatformPort
      -> LocalAdapter
      -> YidaRuntimeAdapter
          -> ContextResolver
          -> NativeComponentRegistry
          -> YidaApiBridge
```

计划端口：

```ts
interface YidaPlatformPort {
  getRuntimeContext(): RuntimeContext;
  getCurrentUser(): Promise<CurrentUser | null>;
  getCapabilityManifest(): CapabilityManifest;
  searchFormDatas(input: SearchFormInput): Promise<unknown>;
  getFormDataById(input: GetFormInput): Promise<unknown>;
}
```

写操作不进入基础端口，单独放在实验专用的 mutation API 中，并要求显式解锁：

```ts
interface YidaExperimentMutations {
  createTaggedFormRecord(input: TaggedFormRecord): Promise<string>;
  updateTaggedFormRecord(input: TaggedFormRecordUpdate): Promise<void>;
  deleteTaggedFormRecord(input: TaggedFormRecordIdentity): Promise<void>;
  startSelfOnlyProcess(input: SelfOnlyProcessInput): Promise<string>;
}
```

## 4. 阶段与副作用门禁

### L0：运行时清点

只使用 `Object.getOwnPropertyNames`、`Object.getOwnPropertyDescriptors` 和原型链有限深度遍历。检查当前窗口、同源父窗口和同源顶层窗口；跨域异常只记录为不可访问。

允许记录：

- 属性名和类型。
- 函数名称、参数个数。
- React 候选的 `name`、`displayName` 和包装形态。
- 对象来自 current、parent 还是 top。
- `pageConfig` 中经过白名单允许的 `appType`、页面类型和语言信息。
- `loginUser` 的字段名称以及脱敏后的标准化结果。

禁止记录：

- Cookie、Token、CSRF、Authorization 和任何疑似密钥字段。
- 完整人员对象、姓名、工号、手机号、邮箱和头像地址。
- 未知 getter 的返回值。
- 未知函数的执行结果。

### L1：原生组件挂载

先清点，后逐项挂载。每个组件独立使用 Error Boundary，不允许一个候选导致整页白屏。

第一批：

- `EmployeeField`
- `DepartmentField`（L0 实测名称；若其他版本暴露 `DepartmentSelectField` 则作为兼容别名）
- `SelectField`

第二批：

- `AttachmentField`
- `ImageField`
- `DataManageViews`

第二批先采用无远端写入门禁：附件和图片固定 `autoUpload=false`，只选择本地生成的非敏感小文件并验证值结构、清空和受控回填；`DataManageViews` 只以空数据、只读参数验证发现和挂载。真实文件上传需要单独确认其存储与清理语义后才能进入后续阶段。

第三批：

- `PortalTopBanner`
- `PortalQuickEntry`
- `QuickAccessCard`
- `RecentlyUsedCard`
- `DataCard`
- `PortalContainer`

每个组件分别验证发现、可渲染、弹层、搜索、选择、清空、受控回填、权限错误、PC 和移动端。原始值只进入本机忽略缓存；仓库证据只保存字段名、类型和归一化结果结构。

### L2：专用表单 API

创建独立普通表单“宜搭平台运行时实验数据”，不复用业务表单。建议字段：

| 字段     | 类型            | 用途                                           |
| -------- | --------------- | ---------------------------------------------- |
| 实验标记 | `TextField`     | `YIDA_RUNTIME_LAB_<runId>`，用于精确查询和清理 |
| 操作类型 | `SelectField`   | create、update、read、delete                   |
| 摘要     | `TextField`     | 非敏感测试文本                                 |
| 载荷     | `TextareaField` | 小型确定性 JSON                                |
| 实验人员 | `EmployeeField` | 只保存当前登录人                               |
| 实验时间 | `DateField`     | 运行时间                                       |

执行顺序固定为 create -> search -> get -> update -> search -> delete -> confirm absent。任何一步结果未知时停止自动重试，先只读查询实验标记。清理器只能删除本次 `runId` 创建且本机证据记录了 `formInstId` 的记录。

### L3：自处理流程 API

创建独立流程表单“宜搭平台运行时流程实验”，不复用现有业务流程。首轮采用一个节点：

```json
{
  "nodes": [
    {
      "type": "approval",
      "name": "发起人确认",
      "approver": "originator"
    }
  ]
}
```

它表示流程发起后只进入发起人本人的待办。首轮验证通过后，才考虑增加同样由 `originator` 承担的办理节点。

明确禁止：

- 指定其他 userId。
- 部门主管、直属主管、角色、多人审批和通讯录动态选择。
- 抄送、消息、邮件、群通知和连接器节点。
- 自动发起多条流程。

流程发布前必须再次展示目标应用、表单、节点数、节点名称和 `approver: originator`，取得用户明确确认。流程发起前页面必须同时满足：

1. 构建期 `expectedAppType` 与运行时 `pageConfig.appType` 一致。
2. `window.loginUser` 与桥接 `getLoginUserId()` 归一化后指向同一用户；缺少任一结果时不自动发起。
3. 流程定义静态扫描只发现 `originator`，且不存在 carbon、role、deptLeader、directLeader 或固定 users。
4. 页面展示“流程将发送给当前登录人本人”，由用户主动点击一次确认按钮。

实验脚本每次最多创建一个流程实例，不在页面加载或发起动作后自动审批。任务执行是独立动作，只有在只读定位唯一本人实例、更新字段回读一致、用户再次明确确认后才允许以当前登录人 `AGREE` 本人的唯一待办。实例和任务 ID 只在内存及被忽略的本机证据中使用，不进入脱敏页面证据。

### L4：JS API 能力矩阵

使用独立 display 页面维护“官方契约、真实发现、实际调用、上下文和风险”五维覆盖状态。第一批仅包含无写副作用方法：

- 表单与流程实例 ID 查询：`searchFormDataIds`、`getProcessInstanceIds`。
- 身份信息：`getLoginUserId`、`getLoginUserName`。
- 页面上下文：`getLocale`、`isMobile`、`isSubmissionPage`、`isViewPage`。
- 纯工具：`getDateTimeRange`、`formatter`。

能力矩阵页面允许自动运行这些只读方法。返回值在适配器内立即转换为类型、顶层字段名、集合数量和是否存在值；用户 ID、姓名、实例 ID、语言值和格式化结果不进入证据。构建目标与实际应用不一致时，两个资源查询方法必须阻断，纯上下文方法仍可用于诊断。

第二批通过独立按钮验证 `toast`、`dialog`、`previewImage`、`openPage` 和 `router.push`。导航目标必须来自逻辑页面映射，并限制为同一测试应用。第三批通过独立按钮验证 `loadScript` 与 `loadStyleSheet`，只允许加载固定、事先确认可访问的测试资源；成功条件不仅是 Promise resolve，还必须观察到预期脚本全局或 stylesheet link。

后续 UI 工具、上传、表单设计和流程高风险方法使用新的分批门禁，不得因为方法被发现就自动执行。`deleteProcessInstance` 不进入能力矩阵自动调用，只允许独立一次性脚本在明确授权后创建并删除本轮唯一的本人实验实例；必须验证完整标记、表单、身份、状态和捕获 ID，并在删除后确认列表归零及详情不可读取。

## 5. 当前用户解析策略

读取顺序：

```text
current window.loginUser
  -> same-origin parent loginUser
  -> same-origin top loginUser
  -> YidaApiBridge.getLoginUserId/getLoginUserName
  -> LocalAdapter or unavailable
```

统一结构：

```ts
interface CurrentUser {
  userId: string;
  businessWorkNo: string;
  name: string;
  deptId: string;
  deptName: string;
  avatar: string;
  source: 'window' | 'parent' | 'top' | 'bridge' | 'local';
}
```

`userId`、`businessWorkNo`、`emplId` 和 `workNo` 分开保存，不互相猜测。前端用户信息只用于界面、实验匹配和查询条件，不能作为后端授权依据。

## 6. 构建环境与运行时环境

构建配置决定 API 地址、连接器、调试能力和预期应用；运行时上下文负责验证实际部署位置。

```text
build profile -> expected app and enabled mutations
window.pageConfig -> actual app and runtime metadata
actual != expected -> read-only probe allowed, mutations blocked
```

这允许同一套源码生成测试和正式构建，同时避免根据内部上下文静默切换敏感行为。

## 7. 页面与资源映射

计划在 `manifest.json` 中增加三个页面键，在本机配置中映射真实页面：

```json
{
  "pages": {
    "platform.runtimeInventory": { "formUuid": "FORM-LOCAL" },
    "platform.nativeComponents": { "formUuid": "FORM-LOCAL" },
    "platform.apiBridge": { "formUuid": "FORM-LOCAL" },
    "platform.jsApiMatrix": { "formUuid": "FORM-LOCAL" }
  },
  "resources": {
    "platform.formSandbox": { "formUuid": "FORM-LOCAL" },
    "platform.fileSandbox": { "formUuid": "FORM-LOCAL" },
    "platform.processSandbox": {
      "formUuid": "FORM-LOCAL",
      "processCode": "TPROC-LOCAL"
    }
  }
}
```

真实值只进入 `targets.local.json`。公开示例使用占位符。

## 8. 证据与回归

每次真实运行生成一份结构化证据：

- 运行时间、客户端类型和页面逻辑键。
- 预期 appType 与实际 appType 是否一致。
- 上下文和组件的分级状态。
- 原生组件交互验收结果。
- API 调用名称、成功/失败和脱敏后的返回结构。
- 写操作产生的实验标记和清理状态。
- 流程静态安全扫描和实际处理人匹配结果。

原始证据写入 `.cache/playwright/platform-runtime/`；可提交报告删除真实应用、组织、人员、实例和流程标识，只保留能力名称、结构指纹及通过状态。

### 流程沙箱页面视觉契约

- `themeProfile`：跟随当前宜搭应用主题，页面作用域，不改变应用导航。
- `backgroundLayer`：低饱和近白渐变画布，顶部使用弱径向光洗，不使用高饱和装饰。
- `visualScaffold.rootShell`：最大宽度 1180px，页面内边距 24px；移动端改为 16px。
- `visualScaffold.prioritySurface`：流程安全说明与当前门禁状态，不使用大 KPI 卡。
- `visualScaffold.statusPrimitive`：64-88px 紧凑状态摘要，分别展示应用匹配、身份一致、定义安全和实例上限。
- `visualScaffold.actionPrimitive`：先执行只读预检，再勾选本人确认，最后启用唯一一次流程发起按钮。
- `visualScaffold.contentPrimitive`：门禁检查列表、实验数据输入和脱敏证据。
- `visualScaffold.contextPrimitive`：右侧安全边界说明，明确无抄送、无固定人员、无自动审批。
- `visualScaffold.statePrimitive`：未检查、检查失败、可发起、已发起四种状态均提供下一步提示。
- `surfaceMap`：首屏使用半透明细线面板；检查项使用紧凑列表行；危险动作区使用浅警示底而不是大面积色块。
- `roundedRule`：业务面板 22px，控件 12px，标签使用胶囊圆角。
- `densityRule`：面板 padding 24px，面板 gap 16px，列表行最小高度 48px，按钮高度 38px。
- `breathingRule`：组内间距 12px，组间间距 16px；空态最大高度 96px，不制造大面积空白。
- `componentRecipe`：antd 负责按钮、输入、复选框、提示和标签；`lucide-react` 只使用语义明确的线性图标。
- `responsiveRule`：桌面双栏、移动端单列；移动端保留全部门禁信息和唯一发起按钮。
- `acceptanceChecks`：应用不匹配或身份不一致时按钮不可用；未经勾选不可发起；一次成功后按钮永久禁用；页面加载零写入。
- `lifecycleAction`：只读定位当前用户发起和处理、带实验标记且唯一的 `RUNNING` 实例；读取详情与审批记录后才允许终止。
- `terminationAcceptance`：终止必须显式勾选确认；成功后再次读取详情和审批记录，页面显示运行中实例 0、当前用户待办 0、状态 `TERMINATED`；流程记录必须保留。
- `completionAction`：完成链路拆成两次明确确认。先更新摘要、载荷和实验时间并回读字段完全一致；再同意当前用户唯一待办。任务执行返回后以有上限的只读轮询等待状态和审批轨迹最终一致。
- `completionAcceptance`：实例状态必须为 `COMPLETED`，当前用户待办为 0，并存在当前用户的 `agree`、`同意` 或 `EXECUTE_TASK_NORMAL` 历史信号。审批前后的记录总数不作为验收条件。记录必须保留，禁止自动删除。

## 9. 实施顺序

1. 建立证据类型、脱敏器、上下文解析器及本地单元测试。
2. 实现 `runtimeInventory` 并发布，只执行 L0。
3. 根据真实清点结果实现 `nativeComponents`，先验证 EmployeeField。
4. 建立外层白名单 API 桥，实现登录人和表单只读调用。
5. 经确认后创建专用普通表单，执行一次可回滚 CRUD。
6. 再次取得流程发布确认后创建自处理流程。
7. 经用户主动点击，最多发起一个只发送给本人的流程实例。
8. 对该唯一实例完成详情、审批记录和终止验证，或在两次明确确认后完成字段更新、本人同意与 `COMPLETED` 验证；删除能力仅清点，不自动调用。
9. 新建独立 JS API 能力矩阵页面，先完成无写副作用方法的 PC 工作台覆盖，再按风险分批扩展其他上下文。
