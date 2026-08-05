# KestrelReader

KestrelReader shows text one word at a time at a fixed spot on screen (RSVP). You read without moving your eyes across the page.

Live app: [kestrel-reader.vercel.app](https://kestrel-reader.vercel.app/). Extension builds are on the Releases page.

## How it works

No account. No cloud uploads. Parsing and storage stay on your device.

## Use it

Open the web app in your browser. To install it, use your browser's install option for the PWA.

For the extension: download the zip from Releases, unzip it, open your browser's extensions page, enable developer mode, and load the unpacked folder.

## Development

You need Node.js. Rust is only required for the Tauri desktop build.

```bash
npm install
npm run dev
```

Extension: `npm run build:extension`, then load `dist-extension` in developer mode.

Desktop: `npx tauri build` (requires Rust).

## Privacy

No personal data collected. See [PRIVACY.md](PRIVACY.md).

## License

MIT
