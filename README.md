# Baby's Diary Web

Mobile-first Next.js + Tailwind diary for tracking a baby's daily routine.

## Stack
- Next.js App Router + React + TypeScript strict mode
- Tailwind CSS v4
- Auth.js / NextAuth, Google-only OAuth
- MongoDB native driver + Auth.js MongoDB adapter
- SWR shared client data cache
- Zod for API DTO validation
- Native SVG/CSS charts (no chart/UI framework)

## Environment
Copy `.env.example` to `.env.local` and set:

```bash
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...
MONGODB_URI=...
GOOGLE_DRIVE_CLIENT_ID=... # optional, falls back to AUTH_GOOGLE_ID
GOOGLE_DRIVE_CLIENT_SECRET=... # optional, falls back to AUTH_GOOGLE_SECRET
NINE_ROUTER_API_KEY=...
NINE_ROUTER_MODEL=...
OPEN_ROUTER_KEY=...
OPEN_ROUTER_MODEL=...
```

`AUTH_SECRET` is additionally required by Auth.js. Generate a strong random value (Auth.js CLI can generate one). The server-side Analysis feature uses `NINE_ROUTER_*` first and falls back to `OPEN_ROUTER_*` only when 9router fails; neither API key is sent to the browser.

For Google OAuth, add these authorized redirect URIs:
- local: `http://localhost:3000/api/auth/callback/google`
- production: `https://YOUR_DOMAIN/api/auth/callback/google`
- Google Drive local: `http://localhost:3000/api/integrations/google-drive/callback`
- Google Drive production: `https://YOUR_DOMAIN/api/integrations/google-drive/callback`

## Image storage

Every activity can contain up to 20 JPG, PNG, WebP, GIF, or AVIF images (8 MB each). Selected files stay local as previews and are uploaded only when the activity is saved. Open the account menu and choose **Quản lý storage** to connect Cloudinary or Google Drive, switch the active destination, or disconnect an account. Cloudinary uses its MCP OAuth flow; Google Drive uses `GOOGLE_DRIVE_*` credentials when present and otherwise reuses the main Google OAuth client. Drive images remain private and are served through an authenticated, same-origin route.

## Run
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to GitHub/GitLab/Bitbucket.
2. Import it in Vercel.
3. Add all environment variables above.
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
The protected app shell owns one SWR cache shared by Home, Dashboard, History, and Analysis. Home, Dashboard, and Analysis are persistent client-side tab panels: visited panels stay mounted, preserve their UI and scroll state, and switch immediately. The bottom tabs use Next.js-integrated Native History updates, so URLs remain deep-linkable and Back/Forward works without an RSC request on every tab change. Navigating between pages or returning from another browser tab reuses cached data without a loading reset or focus-triggered request. Successful activity creates, edits, and deletes update every matching cached activity list immediately; explicit retries and network reconnection can still revalidate data.

The PWA service worker pre-caches the activity artwork used by Quick Track. Its cache name includes the version from `package.json`; activating a new app version removes older activity-asset caches. API responses and authenticated HTML are never stored by the service worker.

## Breastfeeding timer

The breastfeeding timer is owned by the protected app shell rather than the tracking page. Its session is stored in `sessionStorage`, so it survives navigation and PWA background suspension but ends with the page/app session. Elapsed time is derived from timestamps instead of relying on background intervals, which mobile operating systems may throttle or pause. The timer is cleared only after a successful breastfeeding save or an explicit cancel action.

## Analysis

The Analysis tab can summarize the latest 7, 14, 30, or 90 days through 9router, with OpenRouter used only as a fallback when the primary request fails. Its conclusion combines diary-derived observations with a fixed catalog of age-appropriate WHO reference ranges and links back to the official sources it uses. Activity notes and the baby's derived age in days are included in the model input, while the baby's name and full birth date are omitted. The latest result for each time window is persisted in MongoDB and is regenerated only after an explicit user action.
