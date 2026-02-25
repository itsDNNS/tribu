import { Component as ReactComponent, useEffect } from 'react';
import Head from 'next/head';
import { AppProvider } from '../contexts/AppContext';
import '../styles/globals.css';

class ErrorBoundary extends ReactComponent {
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
        <div style={{ padding: 40, fontFamily: 'monospace', color: '#ff6b6b', background: '#1a1a2e', minHeight: '100vh' }}>
          <h1>Client Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.7, fontSize: 12, marginTop: 16 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TribuApp({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        </Head>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <div className="mesh-bg" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <Component {...pageProps} />
      </AppProvider>
    </ErrorBoundary>
  );
}
