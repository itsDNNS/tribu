import { Html, Head, Main, NextScript } from 'next/document';

// Marks installed apps before the first paint (data-display-mode), so the
// layout does not jump once React starts.
const DISPLAY_MODE_BOOTSTRAP = `
(() => {
  try {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    document.documentElement.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
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
        {!isDisplay && <script dangerouslySetInnerHTML={{ __html: DISPLAY_MODE_BOOTSTRAP }} />}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
