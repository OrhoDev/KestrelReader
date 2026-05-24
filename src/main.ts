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
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
    console.warn('[KestrelReader] Service worker registration failed:', error);
  });
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
