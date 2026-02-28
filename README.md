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

This project has **4 backend APIs** you can wire to frontend/mobile clients.

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

4. `GET /api/health`
   - Purpose: service health check.

## Deploy on Railway (recommended for this repo)

This repository now includes **`railway.json`** so Railway can auto-detect startup + health checks.

### 1) One-time setup
1. Push latest code to GitHub.
2. Go to Railway → **New Project** → **Deploy from GitHub repo**.
3. Select this repository.

### 2) Service configuration
Railway will use:
- Start command: `npm start`
- Health check path: `/api/health`
- Health check timeout: `120s`

(These are defined in `railway.json`.)

### 3) Environment variables
Set in Railway dashboard → Variables:
- `NODE_ENV=production`
- `PORT` is provided by Railway automatically (do not hardcode)

### 4) Verify deploy
After first successful deploy, open your Railway generated domain and run:

```bash
curl -sS https://<YOUR-RAILWAY-DOMAIN>/api/health
```

Expected:

```json
{"ok":true,"service":"jobready-ai-agent"}
```

Then test jobs endpoint:

```bash
curl -sS "https://<YOUR-RAILWAY-DOMAIN>/api/jobs/active?limit=5"
```

## Frontend/API attach flow (already implemented)
1. Upload resume file to `/api/resumes/upload`.
2. Read returned `resumeId`.
3. Call `/api/jobs/match` with this `resumeId`.
4. Render ranked jobs.

## cURL examples

```bash
curl -X POST http://localhost:3000/api/resumes/upload \
  -F "resume=@/path/to/resume.pdf"
```

```bash
curl -X POST http://localhost:3000/api/jobs/match \
  -H "Content-Type: application/json" \
  -d '{"resumeId":"PUT_RESUME_ID_HERE"}'
```

## Production hardening checklist
- Add auth (JWT/API key) before exposing APIs publicly.
- Replace in-memory `resumeStore` with Redis/PostgreSQL for persistence.
- Add rate limiting + strict CORS policy.
- Add MIME allowlist + malware scan for uploads.
- Add monitoring + alerting.
