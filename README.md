# The Sprint Table

A restaurant-review-inspired sprint retro app. The sprint opens on a review timeline, with a separate tab to write a review. Rate the sprint, leave an optional next-sprint action, make original cartoon cover art, and download a Markdown recap. Example reviews appear in the timeline until the first real review is posted.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm start`.
3. Open `http://localhost:4173`.

No package installation is needed. Reviews and sprints are saved in this browser's local storage. Each browser has its own data; opening the same link on another device does **not** create a shared team board yet. Download a recap to keep a portable copy.

## Cover art

The sample cover works without setup. You can also copy an art prompt from the app and use it in an image tool. To enable the **Generate cover art** button locally, set `OPENAI_API_KEY` and a private `ART_STUDIO_CODE` in your shell before running `npm start`. The code is entered in the art studio and is not saved in the browser. The API key stays server-side. Image generation uses OpenAI's Images API and may incur API charges.

The API endpoint is `api/generate-image.js`, ready for Vercel's Node.js Functions. When deploying, add both environment variables in Vercel. The frontend is plain static files in `public/` and has no build step.

## Next integration step

To collect reviews from teammates on separate devices, add shared storage and a way to control access before publishing a team link. The current version is a complete single-browser prototype, intended for trying the retro format and refining it before deployment.
