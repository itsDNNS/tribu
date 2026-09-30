import { Component as ReactComponent } from 'react';
import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AppProvider, useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { ToastProvider } from '../contexts/ToastContext';
import { ToastContainer } from '../components/Toast';
import { PWABanners } from '../components/PWABanners';
import '../styles/tokens.css';
import '../styles/globals.css';
import '../styles/dashboard.css';
import '../styles/calendar.css';
import '../styles/responsive.css';
import '../styles/settings.css';
import '../styles/shopping.css';
import '../styles/tasks.css';
import '../styles/capture.css';
import '../styles/today.css';
import '../styles/family.css';
import '../styles/shell.css';
import '../styles/admin.css';
import '../styles/display.css';
import '../styles/welcome.css';
import '../styles/rewards.css';

// Routes that MUST NOT mount the global app bootstrap (AppProvider,
// ToastProvider, PWABanners). AppProvider hits /auth/me, /families/me,
// member loaders, and notifications on mount — none of which are
// allowed for the shared-home display page (issue #172). A wall
// tablet that happens to have a leaked admin cookie would otherwise
// silently authenticate against personal endpoints and leak data
// the display surface explicitly excludes.
const STANDALONE_ROUTES = new Set(['/display']);

function isStandaloneRoute(pathname) {
  if (!pathname) return false;
  return STANDALONE_ROUTES.has(pathname);
}

export function __isStandaloneRouteForTest(pathname) {
  return isStandaloneRoute(pathname);
}


// Top-level ErrorBoundary. Detail is gated by NODE_ENV: a stack trace
// in front of an end user leaks file paths, internal symbols, and
// library versions, which is exactly the kind of fingerprint a
// scanner uses to pick the next exploit. Developers still need the
// full message + stack, so dev keeps them.
export class ErrorBoundary extends ReactComponent {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const isDev = process.env.NODE_ENV !== 'production';
      return (
        <div
          role="alert"
          style={{
            padding: 40,
            fontFamily: 'monospace',
            color: '#ff6b6b',
            background: '#1a1a2e',
            minHeight: '100vh',
          }}
        >
          <h1>Something went wrong</h1>
          <p>The page failed to load. Please reload, and contact your admin if the problem persists.</p>
          {isDev && (
            <>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.message}</pre>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  opacity: 0.7,
                  fontSize: 12,
                  marginTop: 16,
                }}
              >
                {this.state.error.stack}
              </pre>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function DisplayModeRootFlag() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const applyDisplayMode = () => {
      const isStandalone = displayModeQuery.matches || window.navigator.standalone === true;
      document.documentElement.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
    };

    applyDisplayMode();
    displayModeQuery.addEventListener('change', applyDisplayMode);

    return () => {
      displayModeQuery.removeEventListener('change', applyDisplayMode);
      delete document.documentElement.dataset.displayMode;
    };
  }, []);

  return null;
}

// The first stop for keyboard users, in the family's language.
function SkipLink() {
  const { messages } = useApp();
  return <a href="#main-content" className="skip-link">{t(messages, 'aria.skip_to_content')}</a>;
}

export default function TribuApp({ Component, pageProps }) {
  const router = useRouter();
  const standalone = isStandaloneRoute(router?.pathname);

  if (standalone) {
    // Standalone routes (currently just /display) render with NO
    // global providers. Anything they need must be self-contained.
    // This is the production wrapper that proves the display route
    // never triggers /auth/me, /families/me, notifications, etc.
    return (
      <ErrorBoundary>
        <Head>
          <title>Tribu</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <Head>
            <title>Tribu</title>
            <meta name="description" content="Self-hosted family organizer for calendars, tasks, shopping lists, contacts, meal planning, and more." />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
          </Head>
          <DisplayModeRootFlag />
          <SkipLink />
          <div className="mesh-bg" aria-hidden="true" />
          <div className="grain" aria-hidden="true" />
          <PWABanners />
          <Component {...pageProps} />
          <ToastContainer />
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
