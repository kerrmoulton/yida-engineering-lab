export const FLOWBOARD_CSS = `
.flow-root {
  --flow-brand: var(--color-brand1-6, #5b6fc7);
  --flow-brand-soft: var(--color-brand1-1, #eef1ff);
  --flow-border: #dce3ed;
  min-height: 100vh;
  position: relative;
  isolation: isolate;
  color: #172033;
  background:
    radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--flow-brand) 16%, transparent), transparent 32%),
    linear-gradient(145deg, #f5f8fc 0%, #eef3f8 56%, #f8fafc 100%);
  padding: 24px;
}
.flow-shell { max-width: 1440px; margin: 0 auto; position: relative; z-index: 1; }
.flow-hero { display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; margin-bottom: 16px; }
.flow-eyebrow { color: var(--flow-brand); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
.flow-hero h1 { margin: 6px 0; font-size: clamp(28px, 4vw, 44px); line-height: 1.08; }
.flow-hero p { margin: 0; color: #607086; max-width: 720px; }
.flow-health { display: flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 13px; background: rgba(255,255,255,.74); border: 1px solid rgba(255,255,255,.9); white-space: nowrap; }
.flow-health-dot { width: 8px; height: 8px; border-radius: 50%; background: #d89614; }
.flow-health.is-online .flow-health-dot { background: #2f9e64; box-shadow: 0 0 0 4px rgba(47,158,100,.13); }
.flow-summary { min-height: 72px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--flow-brand) 18%, #dce3ed); border-radius: 22px; background: color-mix(in srgb, var(--flow-brand) 12%, white); margin-bottom: 16px; }
.flow-summary-item { padding: 14px 20px; background: rgba(255,255,255,.7); display: flex; flex-direction: column; justify-content: center; }
.flow-summary-item span { color: #6d7b90; font-size: 12px; }
.flow-summary-item strong { font-size: 20px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-toolbar { padding: 24px; border-radius: 22px; background: rgba(255,255,255,.86); backdrop-filter: blur(12px); margin-bottom: 16px; box-shadow: 0 12px 36px rgba(38,55,82,.07); }
.flow-create, .flow-filters { display: grid; gap: 12px; align-items: center; }
.flow-create { grid-template-columns: minmax(220px,2fr) minmax(150px,1fr) 140px auto; }
.flow-filters { grid-template-columns: minmax(220px,1fr) 180px auto; margin-top: 12px; padding-top: 12px; border-top: 1px solid #edf1f5; }
.flow-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 16px; align-items: start; }
.flow-board { display: grid; grid-template-columns: repeat(3, minmax(245px,1fr)); gap: 12px; min-width: 0; }
.flow-column { border-radius: 22px; background: rgba(255,255,255,.9); padding: 16px; min-width: 0; }
.flow-column-heading { height: 42px; display: flex; gap: 9px; align-items: center; padding: 0 4px 10px; }
.flow-column-heading > span:last-child { margin-left: auto; color: #718096; font-variant-numeric: tabular-nums; }
.flow-column-dot { width: 9px; height: 9px; border-radius: 50%; background: #8a94a6; }
.flow-column[data-status="in_progress"] .flow-column-dot { background: #d89614; }
.flow-column[data-status="done"] .flow-column-dot { background: #2f9e64; }
.flow-task-list { display: flex; flex-direction: column; gap: 10px; }
.flow-task { min-height: 92px; padding: 15px; border: 1px solid #e4e9f0; border-radius: 16px; background: #fff; cursor: pointer; transition: border-color .16s ease, transform .16s ease; }
.flow-task:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--flow-brand) 38%, #dce3ed); }
.flow-task.is-selected { border-color: var(--flow-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--flow-brand) 12%, transparent); }
.flow-task-heading, .flow-task-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.flow-task > strong { display: block; font-size: 15px; margin-top: 9px; }
.flow-task p { color: #6b778b; font-size: 13px; line-height: 1.5; margin: 6px 0 12px; }
.flow-assignee { display: inline-flex; gap: 6px; align-items: center; color: #67758a; font-size: 12px; }
.flow-task-actions { display: flex; gap: 2px; }
.flow-context { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; }
.flow-panel { border-radius: 22px; padding: 24px; background: rgba(255,255,255,.9); }
.flow-panel h2 { font-size: 16px; margin: 0 0 12px; }
.flow-detail-grid { display: grid; gap: 10px; margin: 0; }
.flow-detail-grid div { display: grid; gap: 3px; }
.flow-detail-grid dt { color: #758196; font-size: 12px; }
.flow-detail-grid dd { margin: 0; word-break: break-word; }
.flow-diagnostic { background: #182132; color: #d8e2f0; }
.flow-diagnostic h2 { color: #fff; }
.flow-diagnostic code { display: block; color: #a8bad0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.flow-error { margin-bottom: 16px; }
.flow-empty { min-height: 96px; display: grid; place-items: center; }
.flow-root :where(.ant-input, .ant-select-selector, .ant-btn) { border-radius: 12px !important; }
.flow-root :where(.ant-input, .ant-select-selector) { border-color: var(--flow-border) !important; outline: none !important; box-shadow: none !important; }
.flow-root :where(.ant-input:focus, .ant-input-focused, .ant-select-focused .ant-select-selector) { border-color: color-mix(in srgb, var(--flow-brand) 55%, white) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--flow-brand) 16%, transparent) !important; }
@media (max-width: 1100px) {
  .flow-layout { grid-template-columns: 1fr; }
  .flow-board { overflow-x: auto; }
  .flow-context { position: static; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width: 720px) {
  .flow-root { padding: 14px; }
  .flow-hero { align-items: flex-start; flex-direction: column; }
  .flow-summary { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .flow-toolbar, .flow-panel { padding: 16px; }
  .flow-create, .flow-filters { grid-template-columns: 1fr; }
  .flow-board, .flow-context { grid-template-columns: 1fr; }
}
`;
