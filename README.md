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
npm run test:platform:remote
npm run test:platform:native:remote
npm run test:platform:file-storage:remote
npm run run:platform:file-lifecycle:once
npm run test:platform:api:remote
npm run test:platform:crud:remote
npm run test:platform:process:remote
npm run test:platform:js-api-matrix:remote
npm run publish:platform:file-import
npm run verify:platform:file-import
npm run run:platform:process:once
npm run run:platform:process:terminate-once
npm run run:platform:process:complete-once
npm run run:platform:process:delete-once
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

平台运行时实验使用逻辑资源键引用测试表单。作者源码只写 `platform.formSandbox`，真实 `formUuid` 由本机 `targets.local.json` 在构建时注入。`test:platform:api:remote` 只调用字段定义与数据列表两个白名单读方法，并只保存返回形状，不保存人员、字段或记录值。

`test:platform:native:remote` 验证宜搭运行时注入的原生组件。默认只用内存生成的小文件并强制 `autoUpload=false`，验证本地选择、结构归一化、清空和受控回填，不产生远端文件；`DataManageViews` 只做空数据只读挂载。只有显式设置 `YIDA_LAB_ALLOW_SYNTHETIC_UPLOAD=1` 才会尝试把同一批伪造文件上传，且可用 `YIDA_LAB_SYNTHETIC_UPLOAD_COMPONENTS=ImageField` 限定组件；脚本不读取磁盘文件。

`test:platform:file-storage:remote` 打开专用普通表单的新增抽屉，验证真实 `AttachmentField` 和 `ImageField` 容器。默认只确认字段和两个文件 input 存在，不上传；显式设置 `YIDA_LAB_ALLOW_SYNTHETIC_UPLOAD=1` 后，只使用内存生成的微型 TXT 和 PNG，验证传输成功、字段条目、图片预览和字段移除，全程不填写实验标记、不点击提交，因此不创建表单记录。证据不保存 URL、响应体或文件内容；字段移除不被当作底层临时存储物理删除保证。

`run:platform:file-lifecycle:once` 是独立的高风险闭环，必须显式设置 `YIDA_LAB_CONFIRM_FILE_LIFECYCLE=1`。它从 Canvas 的标准入口打开原生 submission 表单，只上传内存生成的微型 TXT 和 PNG；上传完成后再填写短唯一标记，提交恰好一条记录，通过宜搭 JS API 读回附件与图片字段结构，只按捕获到的 `formInstId` 删除，并轮询确认该标记归零。结构化证据会脱敏写入 `.cache/playwright/platform-file-lifecycle/`。删除表单记录不被当作底层文件对象已立即物理删除的保证。

`platform.nativeComponents` 页面已经把这条结论封装成标准表单入口：Canvas 通过 `platform.fileSandbox` 逻辑资源键构建 submission 路由，PC 端使用 50% 宽的 `FormOpenContainer` 抽屉，移动端进入原生提交页；iframe 固定带 `isRenderNav=false` 并同步页面主题。默认远程回归只验证抽屉和两个字段加载，不触发文件选择或上传。

`platform.fileImportChannels` 是文件导入三通道实验页。它只使用程序生成的 `SYN-*` Excel，分别验证浏览器标准 multipart 直传（公网与 localhost）、浏览器解析后通过 localhost 或“宜搭测试接口”连接器提交 JSON，以及宜搭 OSS 附件中转。实测前两类在真实页面均成功；第三类受部署环境鉴权策略影响，不纳入可复用的本地开发链路。实验在此收敛，真实 OpenAPI 调用默认关闭；应用密钥和 systemToken 不允许进入 Canvas 源码或仓库配置。

三种文件通道统一实现 `importService.importFile(file, options?)`。业务页面省略 `options` 时由运行时 profile 选用适配器：本地开发默认走 localhost multipart，宜搭测试构建默认在浏览器解析后走连接器 JSON；实验页才显式指定通道进行对照。所有适配器返回同一 `FileImportResult`，底层差异只通过 `channel`、`transport`、`phase` 和 `diagnostics` 保留为可观察信息。宜搭附件适配器保留实现和纯契约测试，但默认关闭且不进入真实回归。

导入页面的可见交互不依赖底层上传控件：自定义按钮触发屏幕外的浏览器文件输入；宜搭 `AttachmentField` 也以屏幕外挂载方式接入。真实页面验证确认两颗自定义按钮都能打开文件框，宜搭通道实际命中组件内部的 `input[type=file]`；运行态不支持触发时仍返回明确诊断。

`test:platform:crud:remote` 只操作专用实验表单：最多创建一条唯一标记记录，精确验证创建、查询、详情和更新后，再使用创建响应中的 `formInstId` 删除并确认标记查询为零。写入必须由页面上的两个独立按钮显式触发，页面加载本身始终无写副作用。

`test:platform:js-api-matrix:remote` 在独立页面验证首批 10 个无写副作用 API，并通过独立按钮验证 5 个受控 UI/导航 API 以及 `loadScript`、`loadStyleSheet` 两个外部资源加载 API。导航目标由逻辑页面键注入并限制为同一测试应用；外部资源使用固定测试 URL，并验证加载后的实际 DOM/全局效果。结构化证据只保存能力状态、返回类型、顶层字段名、集合数量和是否有值，不保存用户、实例或字段值。

流程沙箱只处理当前登录人发起、当前登录人处理且带实验标记的唯一实例。发起、终止、更新并同意分别要求 `YIDA_LAB_CONFIRM_SELF_ONLY_PROCESS=1`、`YIDA_LAB_CONFIRM_SELF_ONLY_TERMINATE=1`、`YIDA_LAB_CONFIRM_SELF_ONLY_COMPLETE=1`。完成链路会先回读更新字段，再以当前用户 `AGREE` 唯一待办，最终要求实例为 `COMPLETED`、当前用户待办为零且出现同意历史记录。流程状态和审批记录存在短暂最终一致性，页面使用有上限的只读轮询。

流程实例删除使用独立一次性命令 `run:platform:process:delete-once`，必须设置 `YIDA_LAB_CONFIRM_SELF_ONLY_DELETE=1`。脚本最多发起一条删除专用随机标记流程；删除前重新核对目标应用、专用表单、标记、实例 ID、RUNNING 状态、发起人以及全部处理人均为当前登录用户，只把捕获 ID 传给 `deleteProcessInstance`。删除后同时要求列表标记归零且原 ID 详情不可读取；若发起成功但响应未直接返回 ID，脚本只允许从完整字段匹配的唯一运行中删除实验实例恢复，不会创建第二条或触碰历史实例。

本地检查会遍历 manifest 中的全部页面；守卫、发布和远端回读必须用 `--page` 明确指定一个逻辑页面，避免误覆盖。发布会先检查线上漂移，再执行 Canvas 发布和健康检查，最后为该页面单独更新本机基线。检测到线上内容偏离基线时会停止，不自动覆盖远端。

日常开发只修改 `labs/*/src/`。生成目录、登录缓存、本地目标配置和真实发布基线均不进入 Git。
