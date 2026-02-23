import Head from 'next/head';
import { AppProvider } from '../contexts/AppContext';
import '../styles/globals.css';

export default function TribuApp({ Component, pageProps }) {
  return (
    <AppProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>
      <div className="mesh-bg" />
      <div className="grain" />
      <Component {...pageProps} />
    </AppProvider>
  );
}
