import { AppProvider } from '../contexts/AppContext';

export default function TribuApp({ Component, pageProps }) {
  return (
    <AppProvider>
      <Component {...pageProps} />
    </AppProvider>
  );
}
