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

Yes — this project now has **4 backend APIs** that you can wire to frontend or mobile clients.

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

## Production attachment notes
- Put this service behind Nginx/Cloudflare/Load Balancer.
- Add auth (JWT/API key) before exposing APIs publicly.
- Replace in-memory `resumeStore` with Redis/DB for persistence.
- Add file malware scanning + MIME validation for secure uploads.
