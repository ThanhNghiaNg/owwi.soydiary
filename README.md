# BabyTrack Web

Mobile-first Next.js + Tailwind reconstruction of the supplied baby-tracker screens.

## Stack
- Next.js App Router + React + TypeScript strict mode
- Tailwind CSS v4
- Auth.js / NextAuth, Google-only OAuth
- MongoDB native driver + Auth.js MongoDB adapter
- Zod for API DTO validation
- Native SVG/CSS charts (no chart/UI framework)

## Environment
Copy `.env.example` to `.env.local` and set:

```bash
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...
MONGODB_URI=...
OPEN_ROUTER_KEY=...
OPEN_ROUTER_MODEL=...
```

`AUTH_SECRET` is additionally required by Auth.js. Generate a strong random value (Auth.js CLI can generate one). The two `OPEN_ROUTER_*` values power the server-side Analysis feature; the key is never sent to the browser.

For Google OAuth, add these authorized redirect URIs:
- local: `http://localhost:3000/api/auth/callback/google`
- production: `https://YOUR_DOMAIN/api/auth/callback/google`

## Run
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to GitHub/GitLab/Bitbucket.
2. Import it in Vercel.
3. Add the four environment variables above.
4. Deploy.
5. Put the Vercel production callback URL into Google Cloud OAuth credentials.

For best latency, choose a Vercel region close to your MongoDB Singapore deployment when your Vercel plan/configuration allows it. The MongoDB client is module-scoped and reuses a small connection pool.

## Architecture
- `src/modules/baby`: baby DTO/model/repository/mapper/onboarding
- `src/modules/activity`: discriminated Zod DTO, generic Mongo activity model, registry, generic editor
- `src/modules/home`: cache-first tracker/timeline UI
- `src/modules/dashboard`: aggregation and native chart components
- `src/components`: reusable app shell/navigation/icons/header
- `src/app/api`: thin authenticated route handlers

All activity records share one collection with a typed `type` discriminator. Adding/removing an activity generally means adding one Zod variant, one registry item, and one UI field block instead of creating an entirely separate CRUD stack.

## Cache-first behavior
The tracker and dashboard initialize from `localStorage` immediately after hydration. In parallel they fetch `/api/baby` and `/api/activities` with `cache: no-store`, replace stale cached data, and keep the UI responsive. Successful writes are optimistically inserted into the local cache before returning to the timeline. `loading.tsx` provides a non-blank route shell while protected server layouts resolve auth/onboarding.

## Breastfeeding timer

The breastfeeding timer is owned by the protected app shell rather than the tracking page. Its session is stored in `sessionStorage`, so it survives navigation and PWA background suspension but ends with the page/app session. Elapsed time is derived from timestamps instead of relying on background intervals, which mobile operating systems may throttle or pause. The timer is cleared only after a successful breastfeeding save or an explicit cancel action.

## Notes
- The Analysis tab is intentionally a placeholder for routine summaries, trends, and notable changes.
- Breastfeeding timer UI is implemented as a deterministic prototype (+10 sec and play/pause visual state) rather than a background stopwatch. Replace `BreastFields` with a persistent timer state machine when live/background timing becomes in-scope.
