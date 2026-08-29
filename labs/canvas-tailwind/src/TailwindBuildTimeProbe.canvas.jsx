import React from 'react';
import './styles.css';
import { getLabPageUrl } from '@yida-lab/runtime';

function YidaComp() {
  const [result, setResult] = React.useState({ status: 'checking' });

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const element = document.querySelector('[data-tailwind-probe="build-time"]');
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
        values.backgroundColor === 'rgb(124, 58, 237)' &&
        values.paddingTop === '32px' &&
        values.display === 'grid' &&
        values.borderRadius === '14px';
      setResult({ status: passed ? 'passed' : 'failed', ...values });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      data-yida-theme-root="true"
      style={{ minHeight: '100vh', padding: 24, background: '#f5f7fb', color: '#172033' }}
    >
      <h1 style={{ margin: '0 0 8px' }}>Tailwind 路径 B：本地编译后随 Canvas 发布</h1>
      <p style={{ margin: '0 0 20px', color: '#526079' }}>
        作者源码只导入普通 CSS；构建链负责生成 Tailwind 样式和 Canvas 单文件发布产物。
      </p>
      <section
        className="lab-grid lab-gap-4 lab-rounded-proof lab-bg-proof lab-p-8 lab-text-white"
        data-tailwind-probe="build-time"
      >
        <strong>本地编译 Tailwind 样式探针</strong>
        <span>预期：紫色背景、32px 内边距、grid 布局、14px 圆角。</span>
      </section>
      <pre
        data-tailwind-result={result.status}
        style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#fff' }}
      >
        {JSON.stringify(result, null, 2)}
      </pre>
      <a href={getLabPageUrl('tailwind.runtime')} style={{ display: 'inline-block', marginTop: 16 }}>
        查看路径 A：运行时导入
      </a>
    </main>
  );
}

export default YidaComp;
