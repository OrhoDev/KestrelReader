# KestrelReader

KestrelReader is a local-first Rapid Serial Visual Presentation reader designed to make reading digital files easier and less distracting. It serves words to a fixed point on your screen sequentially, allowing you to read without the fatigue of moving your eyes across a page. This project is built primarily as a focused, personal utility for readers who need a quiet environment to process text.

If you want to use KestrelReader without building it from the source code, the live web application is hosted at [kestrel-reader.vercel.app](https://kestrel-reader.vercel.app/), and pre-compiled installers for your operating system are available on the Releases page.

## Idea

KestrelReader is built on the idea that reading software should be a quiet utility rather than a noisy service. It does not require you to create an account, does not track your reading habits, and does not send your documents to external servers. All text processing, including PDF and EPUB parsing, happens entirely on your local machine.

The reader adjusts its playback speed dynamically based on punctuation and word length. It also features a side-by-side context panel that displays the surrounding text when paused, allowing you to quickly recover your place if you lose focus.

## Get Started

To set up KestrelReader locally, you will need Node.js and Rust installed on your computer.

Start by cloning this repository to your machine. Once cloned, navigate into the project directory and run `npm install` in your terminal to set up the necessary dependencies.

To start the local development server for the web app, run `npm run dev`. This will launch a local server and provide an address you can open in your web browser.

To build the web application for production, run `npm run build` (alias: `npm run build:web`). Output goes to `dist/`.

To compile the native desktop application for your operating system, run `npm run build:desktop`. This will compile the backend and package the application files.

To compile the browser extension, run `npm run build:extension`. This will build the packaged extension folder which can be loaded directly into your browser.

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute the code as you see fit.