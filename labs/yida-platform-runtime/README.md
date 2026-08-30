# Yida Platform Runtime Lab

本实验验证宜搭 Code Canvas 能否以可观察、可回归的方式使用平台上下文、宜搭 JS API 和运行态原生组件。实验不把偶然存在的内部对象直接当作稳定业务依赖，而是通过能力清点、适配器和真实环境冒烟测试形成兼容性证据。

详细实验阶段、资源设计和安全门禁见 [实验设计](design.md)。结构化结果遵循 [`platform-runtime-evidence.schema.json`](../../contracts/platform-runtime-evidence.schema.json)。

## 计划页面

| 逻辑页面键                    | 目标                                                 | 默认副作用      |
| ----------------------------- | ---------------------------------------------------- | --------------- |
| `platform.runtimeInventory`   | 清点页面上下文、窗口层级、桥接方法和原生组件名称     | 无              |
| `platform.nativeComponents`   | 逐项挂载并验证成员、部门、附件、图片及门户组件       | 仅用户主动交互  |
| `platform.apiBridge`          | 验证登录人、表单和流程 API 的白名单桥接              | 默认只读        |
| `platform.apiCrud`            | 用单条唯一标记记录验证表单 CRUD 与精确清理           | 用户显式触发    |
| `platform.processSandbox`     | 验证仅本人流程的发起、更新、同意、轨迹和终止生命周期 | 用户显式触发    |
| `platform.jsApiMatrix`        | 维护 JS API 发现、调用和兼容性覆盖矩阵               | UI 项需显式触发 |
| `platform.fileImportChannels` | 验证 multipart、宜搭附件中转与浏览器解析 JSON 导入   | 用户显式触发    |

当前 L1 首批按真实运行时清点结果验证 `EmployeeField`、`DepartmentField` 和 `SelectField`，每个组件使用独立错误边界。

当前 L1 第二批实测 `AttachmentField`、`ImageField` 和 `DataManageViews` 均由 `DeepYida` 暴露并可在 PC 工作台挂载。附件与图片组件使用官方 `autoUpload=false` 契约完成内存生成文件的选择、清空和受控回填；证据只保留值结构，不保存文件名、内容或 URL。显式授权后的附件上传实验只观察到一次凭据类 `GET 200`，没有文件 `POST/PUT`，随后组件触发 `onError`：说明独立 Canvas 挂载不能仅凭 `autoUpload=true` 复用真实表单字段的内建存储上传，还需要显式上传 URL 或真实表单字段容器。远程上传默认关闭，只有 `YIDA_LAB_ALLOW_SYNTHETIC_UPLOAD=1` 才会使用内存伪造文件尝试。`DataManageViews` 在空数据、只读参数下完成安全挂载；由于没有找到同等级公开属性契约，本阶段不注入业务数据源或臆造配置。

文件导入实验已验证两条完整可用路径：同一个内存伪造 XLSX 可从宜搭 Canvas 通过公网或 localhost 标准 multipart 上传并由 Express 解析为 3 行；浏览器也可本地解析后，通过 localhost 或宜搭 HTTP 连接器提交 JSON。第三条宜搭附件中转路径受部署环境鉴权策略影响，不纳入可复用的本地开发链路；实验在此收敛，`temporaryUrl.enabled` 默认保持 `false`，不再发起真实 OpenAPI 请求。systemToken 只能保存在平台连接器或本地秘密配置中，不能打包进 Canvas。

页面现已收敛到单一 `importService.importFile(file, options?)` 契约。默认调用不感知环境：运行时 profile 在本地选择 localhost multipart，在宜搭测试构建选择浏览器解析加连接器 JSON；实验页可显式覆盖通道用于对照。三个适配器都归一化为 `FileImportResult`，统一提供状态、行数、接收数、传输方式、请求标识和诊断信息。宜搭附件适配器只参加无外部请求的契约测试，不参加真实回归。

文件选择界面也与上传实现解耦：页面只展示自定义按钮，普通通道由按钮触发屏幕外的浏览器文件输入；宜搭原生附件通道将 `AttachmentField` 挂载在屏幕外。真实页面验证确认两颗自定义按钮都能打开文件框，宜搭通道实际命中组件内部的 `input[type=file]`。若其他运行态未暴露可触发控件，页面显示确定性的失败代码，不回退为可见原生组件。

真实表单字段容器对照实验已经完成：专用 `platform.fileSandbox` 普通表单中的 `AttachmentField` 和 `ImageField` 均能使用同一批内存伪造文件完成成功传输；附件条目和图片缩略图可见，随后都能从字段值中移除。脚本始终不填写必填实验标记、不点击提交，数据管理列表保持零记录。该对照证明宜搭内建上传上下文属于真实表单字段容器，并不会自动下放给独立 Canvas 中手工挂载的同名组件。字段移除只证明本次表单值已清空，不声明底层临时 OSS 对象已立即物理删除。

Canvas 业务接入路径也已完成：`platform.nativeComponents` 使用标准 `FormOpenContainer` 在 PC 端半屏抽屉内打开文件沙箱 submission 页，移动端则进入原生提交页。路由固定带 `isRenderNav=false`，iframe 加载后同步全局主题；真实表单 ID 只通过构建期逻辑资源映射注入。远端回归确认入口、抽屉、submission 路由及两个上传字段可用，默认不会选择或上传文件。

文件完整生命周期也已完成一次受控闭环：脚本从 Canvas 入口打开同一原生表单，上传内存生成的 TXT 与 PNG，填写短唯一实验标记后提交一条记录；宜搭 JS API 能读回两个文件字段，每个字段均为一个序列化文件对象，包含名称、大小、文件标识以及预览/下载地址等结构。脚本随后只按本轮捕获的 `formInstId` 删除该记录，并由独立数据查询确认表单重新归零。实测文件上传会触发表单重渲染，因此文本标记必须在上传完成后填写并紧邻提交校验。该链路必须显式设置 `YIDA_LAB_CONFIRM_FILE_LIFECYCLE=1`，不承诺表单记录删除会同步物理删除底层临时文件对象。

当前 L2 只读阶段使用独立普通表单验证 `getFormComponentDefinationList` 与 `searchFormDatas`。桥接端口不暴露写方法，作者源码不包含真实表单 ID，远程证据只记录方法状态、顶层字段名和集合数量。专用表单在本阶段保持零记录。

L3 受控 CRUD 使用独立页面并保留 L2 页面。它把写入拆成“运行到删除前”和“删除本次 1 条记录并确认清空”两个显式动作；只删除创建响应捕获的 `formInstId`，结束后专用表单重新回到零记录。

PC 真实运行时结论：`saveFormData`、`searchFormDatas`、`getFormDataById`、`updateFormData` 和 `deleteFormData` 已完成一次九步闭环。`SelectField` 的显示文本位于原字段，稳定选项值位于 `<fieldId>_id`；`deleteFormData` 实际要求 `formInstId`，不能照跨应用 JS API 示例传 `formUuid`。浏览器证据不保存运行标记、实例 ID、人员或真实字段 ID。

PC 流程生命周期结论：当前 `this.utils.yida` 实测存在流程发起、更新、删除、列表、ID 列表、详情、终止、审批记录和任务执行方法。实验已经完成三类仅本人闭环：`RUNNING -> TERMINATED` 会保留记录、增加终止历史并清空待办；`RUNNING -> 更新字段 -> AGREE -> COMPLETED` 会回读更新后的摘要和载荷，产生当前用户的同意历史并清空待办；`RUNNING -> deleteProcessInstance -> NOT_FOUND` 会从实例列表移除记录，原实例 ID 的详情也不可再读取。删除实验要求专用随机标记、当前用户发起与处理、完整字段匹配和唯一实例，并只传入本轮捕获的 `processInstanceId`。`executeTask` 返回与详情、审批记录可见之间存在短暂最终一致性，适配器采用有上限的只读轮询。审批前后记录总数可能不变，因为平台会把 `TODO` 替换为审批历史，不能用“记录数增加”作为完成条件。

PC JS API 能力矩阵首批结论：`searchFormDataIds`、`getProcessInstanceIds`、`getLoginUserId`、`getLoginUserName`、`getLocale`、`isMobile`、`isSubmissionPage`、`isViewPage`、`getDateTimeRange` 和 `formatter` 已在真实工作台页面完成 10/10 调用验证。页面自动运行但只调用无写副作用方法；证据不保存登录人、实例或格式化结果值。

PC JS API 能力矩阵第二批结论：`toast`、`dialog`、`previewImage`、`openPage` 和 `router.push` 已在真实工作台页面完成 5/5 受控验证。五项均只由独立按钮触发；两个导航方法只打开通过逻辑页面键注入的本应用运行时盘点页，作者源码没有写死 `appType` 或 `formUuid`。页面加载期间仍然只执行首批只读检查，不自动弹窗、预览或跳转。

PC JS API 能力矩阵第三批结论：`loadScript` 和 `loadStyleSheet` 已在真实工作台页面完成 2/2 受控验证。测试加载预先确认可访问的阿里 CDN QRCode 脚本与 Normalize CSS，并分别观察到 `window.QRCode` 全局和对应 stylesheet link。两项不会自动运行，证据只保存能力状态，不保存资源响应内容。

矩阵页会在首次挂载时短暂等待 Canvas 生命周期安装 JS API 桥，消除 React 首次渲染早于平台桥接器的时序竞争。开发 OpenYida 桥本身时，发布命令必须通过 `YIDA_LAB_OPENYIDA_BIN` 指向待验证的源码 CLI；否则 PATH 中的旧安装版可能生成过期 Schema。真实浏览器冒烟会把缺失方法判为 `unsupported`，从而阻止旧桥被误记为验证成功。

PC 真实页交互结论：三者均可打开并选择；人员和部门搜索可用，选择范围固定为当前登录人及其当前部门。`DepartmentField` 的 `onChange` 输出为对象形态，但受控 `value` 需要使用其中的标量标识，不能把输出对象原样回填。回归脚本会验证选择、清空和受控回填，并在结束时清空页面值。

真实 `appType`、页面 `formUuid`、实验表单和流程标识只写入被 Git 忽略的 `config/targets.local.json`，不进入作者源码和公开配置。

## 完成定义

- 能区分 `official`、`observed`、`verified`、`unstable` 和 `unsupported` 能力。
- 本地适配器可以覆盖业务代码与值归一化测试，但不会被当作宜搭兼容性证据。
- 真实页面探针不会读取凭证、Cookie、CSRF 或调用未知函数。
- 所有写入只进入专用实验表单，并带可定位、可清理的实验标记。
- 文件存储实验只使用内存伪造文件；默认回归禁止上传。一次性生命周期必须显式授权，最多提交一条唯一标记记录并精确删除、确认归零。
- 流程仅允许发起人本人处理，无抄送、角色、部门主管或其他固定成员。
- 构建目标与 `window.pageConfig.appType` 不一致时阻止有副作用的测试。
