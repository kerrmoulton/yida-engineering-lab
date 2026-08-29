import React from 'react';
import ReactDOM from 'react-dom/client';
import Flowboard from '../src/Flowboard.canvas.jsx';
import { PreviewStatus } from './PreviewStatus.jsx';
import './shell.css';

class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="preview-shell">
      <PreviewStatus />
      <PreviewErrorBoundary>
        <Flowboard />
      </PreviewErrorBoundary>
    </div>
  </React.StrictMode>,
);
