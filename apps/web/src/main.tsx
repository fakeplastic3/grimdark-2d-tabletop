import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <main className="fatal"><span className="eyebrow">APPLICATION ERROR</span><h1>The command station stopped.</h1><p>{this.state.error}</p><p>Your last valid match is retained in this browser when storage is available.</p><button onClick={() => location.reload()}>Reload command station</button></main>;
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
