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

if (isWebPwa && 'serviceWorker' in navigator) {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/.test(window.location.hostname);

  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  } else {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[KestrelReader] Service worker registration failed:', error);
    });
  }
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
