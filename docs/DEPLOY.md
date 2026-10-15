# Deploying a live Onyx demo for free

*Onyx by [differentiatorX](https://github.com/differentiatorX)*

| Piece | Host | Plan |
|:--|:--|:--|
| Database | MongoDB Atlas | M0 free (supports transactions) |
| API and workers | Render web service | Free |
| Redis | Render Key Value | Free |
| Dashboard and checkout | Vercel | Hobby |
| Landing page | GitHub Pages | Free |

## 1. MongoDB Atlas
1. Create a free M0 cluster.
2. Database Access: add a user with a strong password.
3. Network Access: allow `0.0.0.0/0` (Render's free IPs change).
4. Connect, Drivers: copy the URI and put `/onyx` before the `?`, for example
   `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/onyx?retryWrites=true&w=majority`

## 2. Render (API, workers, Redis)
1. Render dashboard: New, Blueprint, select the `onyx` repo. It reads `render.yaml`.
2. Fill the three blank values:
   - `MONGO_URI`: the Atlas URI from step 1
   - `INTERNAL_API_URL`: the service URL Render shows, e.g. `https://onyx-api.onrender.com`
   - `CLIENT_URL`: your Vercel URL from step 3 (come back and set it after Vercel deploys)
3. Deploy. Check `https://<your-api>.onrender.com/health` returns `"ok": true`.

Workers run inside the API process (`RUN_WORKERS_IN_API=true`) because separate background workers are not free on Render.

## 3. Vercel (dashboard)
1. Import the repo. Set **Root Directory** to `client`. Framework preset: Vite.
2. If your Render URL is not `onyx-api.onrender.com`, edit `client/vercel.json` to match and push.
3. Deploy, then copy the Vercel URL into Render's `CLIENT_URL` and redeploy the API.

## 4. Seed demo data
From your machine:
```bash
cd server && npm install
API_URL=https://onyx-api.onrender.com npm run seed
```
Recruiters can now sign in with `demo@onyx.dev` / `onyx-demo-123`, or create their own test account.

## 5. Link it
Add the Vercel URL to the README header and to the landing page buttons in `docs/index.html`.

## Free-tier behaviour to know
- Render free services sleep after 15 idle minutes. The first request takes about a minute to wake it; scheduled jobs pause while it sleeps. Open the API once before an interview.
- Webhooks to the built-in test receiver fail 30% of the time on purpose, so the retries show up in the dashboard.
