import Head from 'next/head';
import { AppProvider } from '../contexts/AppContext';
import '../styles/globals.css';

export default function TribuApp({ Component, pageProps }) {
  return (
    <AppProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="mesh-bg" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <Component {...pageProps} />
    </AppProvider>
  );
}
