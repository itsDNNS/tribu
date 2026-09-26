import { Html, Head, Main, NextScript } from 'next/document';

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
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
