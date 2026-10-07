# Maison Bleu · Sprint 20

A restaurant-review-inspired sprint retro app for Sprint 20. Maison Bleu opens on the review timeline, with a separate tab to write a review. Rate the sprint, leave an optional next-sprint action, generate an original cartoon illustration for your review, and download a Markdown recap.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm start`.
3. Open `http://localhost:4173`.

No package installation is needed. Reviews and their illustrations are saved in this browser's local storage. Each browser has its own data; opening the same link on another device does **not** create a shared team board yet. Download a recap to keep a portable text copy. Generated images are not included in that Markdown download.

## Review illustrations

The large restaurant hero image is fixed. When writing a review, you can copy an image prompt and use it in an image tool. To enable **Generate illustration** locally, set `OPENAI_API_KEY` and a private `ART_STUDIO_CODE` in your shell before running `npm start`. Enter the code in the review form; it is not saved in the browser. The API key stays server-side. Image generation uses OpenAI's Images API and may incur API charges.

The API endpoint is `api/generate-image.js`, ready for Vercel's Node.js Functions. When deploying, add both environment variables in Vercel. The frontend is plain static files in `public/` and has no build step.

## Next integration step

To collect reviews from teammates on separate devices, add shared storage and a way to control access before publishing a team link. The current version is a single-browser prototype for refining the retro format.
