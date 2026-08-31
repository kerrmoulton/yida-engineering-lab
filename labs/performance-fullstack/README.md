# Performance Full-stack Case

本案例以静态领域模型和动态用例/时序模型为输入，验证 AI 在现有工程能力上完成真实多页面全栈系统的能力。

页面中的员工、组织、指标、权重、目标、实际值、自评和多方评价均由用户表单输入，经 Express 领域校验后事务写入 SQLite；后端不生成预设业务输入。应用内快捷跳转导航最外层宜搭工作台，避免在 Canvas iframe 中嵌套第二层应用菜单。

- 五个独立宜搭 display 页面对应运行总览、指标与量化、个人配置、数据与自评、评价与结算。
- 页面共享 TypeScript 领域契约和 UI primitives，但各自拥有独立逻辑键、构建产物、发布目标和远端基线。
- 后端仅监听 `127.0.0.1:4328`，数据仅写入 `.local/performance/performance.sqlite`。
- 所有记录使用 `SYN-*` 合成标识，不创建宜搭表单、流程或业务记录。

```bash
npm run dev:performance
npm run test:performance
npm run test:performance:web
npm run test:performance:e2e
```

本地页面为 `http://127.0.0.1:4327`，API 健康检查为 `http://127.0.0.1:4328/api/performance/health`。
