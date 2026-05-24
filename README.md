# KestrelReader

**Live app:** [https://kestrel-reader.vercel.app/](https://kestrel-reader.vercel.app/)

KestrelReader is a local-first Rapid Serial Visual Presentation reader designed to make reading digital files easier and less distracting. It serves words to a fixed point on your screen sequentially, so you can read without moving your eyes across the page. The web app works in the browser (installable as a PWA from that URL). A Chrome extension build is published on [GitHub Releases](https://github.com/OrhoDev/KestrelReader/releases).

## Idea

KestrelReader is built on the idea that reading software should be a quiet utility rather than a noisy service. It does not require you to create an account, does not track your reading habits, and does not send your documents to external servers. All text processing, including PDF and EPUB parsing, happens entirely on your device.

The reader adjusts playback speed based on punctuation and word length. When paused, a side-by-side context panel shows surrounding text so you can recover your place quickly.

## Use 

| Platform | How |
|----------|-----|
| **Web / PWA** | Open [https://kestrel-reader.vercel.app/](https://kestrel-reader.vercel.app/). Use your browser’s install option to add it to your home screen or desktop. |
| **Chrome extension** | On [Releases](https://github.com/OrhoDev/KestrelReader/releases), download `kestrel-extension-v*.zip`, unzip it, then in Chrome go to `chrome://extensions` → Developer mode → **Load unpacked** → select the unzipped folder. |
| **Desktop (Tauri)** | Not published on Releases yet. Build from source (see below); requires Rust. |

## Get started (development)

You need **Node.js** (20+ recommended). **Rust** is only required if you want to build the Tauri desktop app.

Clone the repository, then from the project root:

```bash
npm install
npm run dev          
npm run check        
npm run build        
npm run build:web    
npm run build:extension   
```

**Desktop (optional):** with Rust installed, run `npx tauri build` from the project root (uses `src-tauri/` and outputs installers under `src-tauri/target/release/bundle/`).

**Extension locally:** after `npm run build:extension`, load the `dist-extension/` folder via **Load unpacked** on `chrome://extensions`.

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute the code as you see fit.
