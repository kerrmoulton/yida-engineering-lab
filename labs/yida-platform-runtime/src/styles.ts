export const RUNTIME_INVENTORY_CSS = `
.runtime-root{min-height:100vh;background:linear-gradient(180deg,#f5f7fb 0%,#eef2f8 100%);color:#172033;padding:28px}
.runtime-shell{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.runtime-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:28px;border-radius:20px;background:linear-gradient(135deg,#1f3768,#4f6db2);color:#fff;box-shadow:0 16px 40px rgba(39,61,110,.18)}
.runtime-hero h1{margin:6px 0 8px;font-size:30px;line-height:1.2;color:#fff}.runtime-hero p{margin:0;max-width:720px;color:rgba(255,255,255,.8);line-height:1.7}
.runtime-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#cbd8ff}.runtime-actions{display:flex;gap:8px;flex-wrap:wrap}
.runtime-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.runtime-summary-item{background:#fff;border:1px solid #e7ebf2;border-radius:16px;padding:18px 20px}.runtime-summary-item span{display:block;color:#68738a;font-size:13px}.runtime-summary-item strong{display:block;margin-top:8px;font-size:24px;color:#1c2a46}.runtime-summary-item code{font-size:14px}
.runtime-card{border-radius:18px;border-color:#e4e9f2;box-shadow:0 8px 28px rgba(31,48,83,.06)}.runtime-card .ant-card-head{border-bottom-color:#edf0f5}
.runtime-component-list{display:flex;flex-wrap:wrap;gap:8px}.runtime-empty{color:#7b8496;padding:8px 0}.runtime-code{max-height:360px;overflow:auto;border-radius:12px;background:#111827;color:#dbeafe;padding:16px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
@media(max-width:800px){.runtime-root{padding:16px}.runtime-hero{flex-direction:column;padding:22px}.runtime-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.runtime-actions{width:100%}}
@media(max-width:480px){.runtime-summary{grid-template-columns:1fr}.runtime-hero h1{font-size:25px}}
`;
