import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

// Force all default Leaflet markers to use our CSS DivIcons
// This prevents the broken blue-square fallback icon
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '',
  shadowUrl: '',
  iconRetinaUrl: '',
});

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
    <App />
  </StrictMode>,
);
