import { Html, Head, Main, NextScript } from 'next/document';

// Runs before the first paint, so neither the layout nor the colors jump once
// React starts: marks installed apps (data-display-mode) and applies the
// stored appearance (data-theme, color-scheme). Keep it static text.
const PRE_PAINT_BOOTSTRAP = `
(() => {
  const root = document.documentElement;
  try {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    root.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
  } catch {}
  try {
    const stored = window.localStorage.getItem('tribu_theme');
    const fixed = stored === 'light' || stored === 'dark' || stored === 'midnight-glass';
    root.dataset.theme = fixed ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.querySelector('meta[name="color-scheme"]').content = !fixed ? 'light dark' : stored === 'light' ? 'light' : 'dark';
  } catch {}
})();
`;

export default function Document({ __NEXT_DATA__: nextData }) {
  // The wall display installs as its own app that opens straight into /display.
  const isDisplay = nextData?.page === '/display';
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="manifest" href={isDisplay ? '/display-manifest.json' : '/manifest.json'} />
        <meta name="theme-color" content={isDisplay ? '#faf8f4' : '#7c3aed'} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {!isDisplay && <meta name="color-scheme" content="light dark" />}
        {!isDisplay && <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_BOOTSTRAP }} />}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
