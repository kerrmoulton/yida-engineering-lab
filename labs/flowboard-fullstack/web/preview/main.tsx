import React from 'react';
import ReactDOM from 'react-dom/client';
import Flowboard from '../src/Flowboard.canvas.tsx';
import { PreviewStatus } from './PreviewStatus.tsx';
import './shell.css';

interface PreviewErrorBoundaryProps {
  children: React.ReactNode;
}

interface PreviewErrorBoundaryState {
  error: Error | null;
}

class PreviewErrorBoundary extends React.Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  constructor(props: PreviewErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): PreviewErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="preview-error" role="alert">
          <strong>Canvas 本地预览发生运行时错误</strong>
          <pre>{this.state.error.stack || this.state.error.message}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root preview mount point');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <div className="preview-shell">
      <PreviewStatus />
      <PreviewErrorBoundary>
        <Flowboard />
      </PreviewErrorBoundary>
    </div>
  </React.StrictMode>,
);
