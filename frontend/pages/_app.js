import { AppProvider } from '../contexts/AppContext';
import '../styles/globals.css';

export default function TribuApp({ Component, pageProps }) {
  return (
    <AppProvider>
      <div className="mesh-bg" />
      <div className="grain" />
      <Component {...pageProps} />
    </AppProvider>
  );
}
