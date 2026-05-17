import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
// Install the PWA service worker for true offline capability.
// The SW caches all static assets + map tiles via Workbox rules
// configured in vite.config.ts. Without this call, offline mode breaks.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log('[PWA] Service Worker registered:', swUrl);
  },
  onOfflineReady() {
    console.log('[PWA] App ready for offline use');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

