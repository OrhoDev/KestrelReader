# KestrelReader

KestrelReader is a local-first Rapid Serial Visual Presentation reader designed to make reading digital files easier and less distracting. It serves words to a fixed point on your screen sequentially, allowing you to read without the fatigue of moving your eyes across a page. This project is built primarily as a focused, personal utility for readers who need a quiet environment to process text.

If you want to use KestrelReader without building it from the source code, the live web application is hosted at [kestrel-reader.vercel.app](https://kestrel-reader.vercel.app/). You can also find compiled browser extension zip files on our Releases page.

## Core Philosophy

KestrelReader is built on the idea that reading software should be a quiet utility rather than a noisy service. It does not require you to create an account, does not track your reading habits, and does not send your documents to external servers. All text processing, including PDF and EPUB parsing, happens entirely on your local machine.

## Using the Application

To use KestrelReader directly in your browser, simply visit the live web application. If you prefer to install it on your device, use your browser's native install option to add the PWA to your home screen or desktop.

To use the browser extension, download the compiled zip file from the Releases page on GitHub and unpack it on your computer. Open your browser's extension management page, enable developer mode, select the option to load an unpacked extension, and choose the unzipped folder.

## Getting Started with Development

To set up KestrelReader locally from this source code, you will need Node.js installed on your computer. Rust is only required if you want to compile and build the native desktop application.

Start by cloning this repository to your machine. Once cloned, navigate into the project directory and run `npm install`
From there, run `npm run dev`. 

To compile the browser extension, run `npm run build:extension`. You can load this `dist-extension` folder directly into your browser via developer mode.

To compile the native desktop application, ensure you have Rust installed and run `npx tauri build` from the project root.

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute the code as you see fit.