# 绩效运营与考评系统

这是 EDA Engineering Lab 的完整业务系统验证，不是单场景演示。系统包含 13 个独立宜搭 display 页面、本地 Express v2 API、SQLite 数据库、批处理任务、审计记录和多状态绩效业务单。

系统中的“流程”只指本地 SQLite 状态机，不创建、不发起、不撤销任何宜搭审批流程，也不向真实人员发送待办。

## 本地运行

```bash
npm run dev:performance:v2
```

- Web：`http://127.0.0.1:4337`
- API：`http://127.0.0.1:4338/api/performance/v2/health`
- 数据库：`.local/performance-v2/performance.sqlite`

## 检查

```bash
npm run typecheck:performance:v2
npm run test:performance:v2
npm run test:performance:v2:web
npm run build:performance:v2:web
```
