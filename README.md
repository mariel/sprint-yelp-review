# Maison Bleu · Sprint 20

A restaurant-review-inspired sprint retro app for Sprint 20. Maison Bleu opens on the review timeline, with a separate tab to write a review. Rate the sprint, leave an optional next-sprint action, generate an original cartoon illustration for your review, and download a Markdown recap. A shared database lets teammates post and read from their own browsers.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm start`.
3. Open `http://localhost:4173`.

Run `npm install` once before `npm start`. Without a database connection, reviews and illustrations stay in the browser's local storage. With `DATABASE_URL` configured, reviews and illustrations are stored centrally and the page refreshes the timeline every 15 seconds. Existing browser reviews remain on the device until you choose **Add them to the shared timeline**. The Markdown recap contains text but not generated images.

## Shared timeline on Vercel

1. In the Vercel dashboard, open the `sprint-yelp-review` project. Under **Storage** or **Integrations**, add the [Neon Postgres integration](https://vercel.com/marketplace/neon/neon), review its plan, and connect it to this project for **Production**. Vercel should add `DATABASE_URL` to the project automatically. The app creates its one review table when the connection is first used.
2. In **Settings → Environment Variables**, add `RETRO_ACCESS_CODE` for **Production**. Pick a private password to share with teammates. This password unlocks the timeline and posting; it is separate from `ART_STUDIO_CODE`, which controls image generation.
3. In **Deployments**, redeploy the latest production deployment so the new variables take effect.
4. Open the live URL in two different browsers. Enter the site password in both. Post a short test review in one; it should appear in the other within 15 seconds or after a refresh.

If `DATABASE_URL` is not configured, the app remains in browser-only mode and says so in the footer. If a database is connected before `RETRO_ACCESS_CODE` is set, shared reviews stay locked. If a configured database fails, the app shows a load error rather than quietly saving posts on one device. The site password is kept in a signed, HTTP-only, seven-day browser cookie; changing `RETRO_ACCESS_CODE` invalidates existing sessions. Do not put database credentials or passwords in this repository.

## Review illustrations

The large restaurant hero image is fixed. When writing a review, you can copy an image prompt and use it in an image tool. To enable **Generate illustration** locally, set `OPENAI_API_KEY` and a private `ART_STUDIO_CODE` in your shell before running `npm start`. Enter the code in the review form; it is not saved in the browser. The API key stays server-side. Image generation uses OpenAI's Images API and may incur API charges.

The API endpoint is `api/generate-image.js`, ready for Vercel's Node.js Functions. To enable generation, add `OPENAI_API_KEY` and `ART_STUDIO_CODE` in Vercel and redeploy. The frontend is plain static files in `public/` and has no build step.

## Limits

The password is shared by the team; this is not a system of individual accounts. Shared posts currently cannot be edited or removed from the app. Each generated illustration is compressed before it is stored with its review in Postgres.
