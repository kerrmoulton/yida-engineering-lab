import React from 'react';
import 'tailwindcss';
import { getLabPageUrl } from '@yida-lab/runtime';

function YidaComp() {
  const [result, setResult] = React.useState({ status: 'checking' });

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const element = document.querySelector('[data-tailwind-probe="runtime-import"]');
      if (!element) {
        setResult({ status: 'missing' });
        return;
      }
      const style = window.getComputedStyle(element);
      const values = {
        backgroundColor: style.backgroundColor,
        paddingTop: style.paddingTop,
        display: style.display,
        borderRadius: style.borderRadius,
      };
      const passed =
        (values.backgroundColor === 'rgb(239, 68, 68)' || values.backgroundColor.startsWith('oklch(')) &&
        values.paddingTop === '32px' &&
        values.display === 'grid' &&
        values.borderRadius === '12px';
      setResult({ status: passed ? 'passed' : 'failed', ...values });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      data-yida-theme-root="true"
      style={{ minHeight: '100vh', padding: 24, background: '#f5f7fb', color: '#172033' }}
    >
      <h1 style={{ margin: '0 0 8px' }}>Tailwind 路径 A：Canvas 运行时直接导入</h1>
      <p style={{ margin: '0 0 20px', color: '#526079' }}>
        该区域只依赖 Tailwind utility class；没有为这些 class 提供兜底 CSS。
      </p>
      <section
        className="grid gap-4 rounded-xl bg-red-500 p-8 text-white"
        data-tailwind-probe="runtime-import"
      >
        <strong>运行时 Tailwind 样式探针</strong>
        <span>预期：红色背景、32px 内边距、grid 布局、12px 圆角。</span>
      </section>
      <pre
        data-tailwind-result={result.status}
        style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#fff' }}
      >
        {JSON.stringify(result, null, 2)}
      </pre>
      <a href={getLabPageUrl('tailwind.buildTime')} style={{ display: 'inline-block', marginTop: 16 }}>
        查看路径 B：本地编译
      </a>
    </main>
  );
}

export default YidaComp;
