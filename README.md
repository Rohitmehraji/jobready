# JobReady AI Agent

A resume-only AI assistant that:
- accepts a resume upload (PDF/DOCX/TXT),
- fetches recent active job postings,
- ranks jobs by resume relevance (skills + experience),
- estimates ATS alignment score,
- returns job title, company, direct application URL, and public HR contact when available,
- supports customizable visual avatar in a glassmorphism UI.

## Run locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## Backend APIs (real integration-ready)

Yes — this project has **4 backend APIs** you can wire to frontend or mobile clients.

1. `POST /api/resumes/upload`
   - Purpose: real resume file upload + parsing (PDF/DOCX/TXT).
   - Request: `multipart/form-data` with `resume` file field.
   - Response: `resumeId` + extracted profile summary.

2. `POST /api/jobs/match`
   - Purpose: fetch active jobs + rank jobs using uploaded resume.
   - Request: JSON `{ "resumeId": "..." }`.
   - Response: ranked jobs with ATS alignment, company, official apply link, HR contact.

3. `GET /api/jobs/active?limit=30`
   - Purpose: returns currently active raw job listings from provider.
   - Useful for admin/debug/dashboard views.

4. `GET /api/health`
   - Purpose: service health check for deployments.

## How to attach these APIs in real apps

### Frontend flow (already implemented in `public/app.js`)
1. Upload resume file to `/api/resumes/upload`.
2. Read returned `resumeId`.
3. Call `/api/jobs/match` with this `resumeId`.
4. Render ranked jobs.

### cURL examples

```bash
curl -X POST http://localhost:3000/api/resumes/upload \
  -F "resume=@/path/to/resume.pdf"
```

```bash
curl -X POST http://localhost:3000/api/jobs/match \
  -H "Content-Type: application/json" \
  -d '{"resumeId":"PUT_RESUME_ID_HERE"}'
```

```bash
curl "http://localhost:3000/api/jobs/active?limit=20"
```

## One-click Render deployment blueprint (tailored)

This repo now includes a Render Blueprint file: **`render.yaml`**.

### What is preconfigured
- Node web service name: `jobready-ai-agent`
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`
- Default env vars:
  - `NODE_VERSION=22`
  - `NODE_ENV=production`
  - `PORT=10000`

### One-click launch steps
1. Push this repo to GitHub (ensure your deployment branch is `main`, or edit `branch:` in `render.yaml`).
2. Open Render dashboard → **New** → **Blueprint**.
3. Connect your GitHub repo and select this repository.
4. Render auto-detects `render.yaml` and shows the service preview.
5. Click **Apply** / **Deploy**.
6. Wait for build to complete; Render will give a public URL like:
   - `https://jobready-ai-agent.onrender.com`

### Post-deploy tests (must pass)

Replace `<YOUR_RENDER_URL>` below with your Render URL.

```bash
curl -sS <YOUR_RENDER_URL>/api/health
```
Expected response shape:

```json
{"ok":true,"service":"jobready-ai-agent"}
```

```bash
curl -sS "<YOUR_RENDER_URL>/api/jobs/active?limit=5"
```
Expected: JSON with `totalFetched` and `jobs[]`.

```bash
curl -sS -X POST <YOUR_RENDER_URL>/api/resumes/upload \
  -F "resume=@/absolute/path/to/resume.pdf"
```
Expected: JSON with `resumeId` and `profileSummary`.

```bash
curl -sS -X POST <YOUR_RENDER_URL>/api/jobs/match \
  -H "Content-Type: application/json" \
  -d '{"resumeId":"<PASTE_RESUME_ID_HERE>"}'
```
Expected: JSON with `jobs[]`, ATS scores, and links.

## Make it truly startup-ready (next hardening)
- Add authentication (API key/JWT) before exposing APIs publicly.
- Replace in-memory `resumeStore` with Redis/PostgreSQL for persistence.
- Add rate limiting and CORS policy.
- Add MIME allowlist + malware scanning for uploads.
- Add logging/monitoring (Render logs + Sentry).
- Add privacy policy / retention rules for uploaded resumes.
