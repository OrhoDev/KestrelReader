import { mount } from 'svelte';
import App from './App.svelte';
import './index.css';

if (window.location.protocol === 'chrome-extension:') {
  document.documentElement.classList.add('extension-popup');
}

const isWebPwa =
  typeof window !== 'undefined' &&
  window.location.protocol !== 'chrome-extension:' &&
  !('__TAURI_INTERNALS__' in window) &&
  !('__TAURI__' in window);

if (isWebPwa && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Check if the current host environment is a local loopback
    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '[::1]' ||
      window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
    );

    // Bypass registration on localhost to prevent caching conflicts with other dev projects
    if (!isLocalhost) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('Kestrel Service Worker registered safely:', reg.scope);
        })
        .catch((error) => {
          console.warn('[KestrelReader] Service worker registration failed:', error);
        });
    } else {
      console.log('Kestrel Service Worker bypassed on localhost to prevent port hijacking.');
    }
  });
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
