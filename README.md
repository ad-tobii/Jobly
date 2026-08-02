# Jobly

AI job-hunting agent. Paste a LinkedIn URL or a job description; Jobly scrapes
the posting, scores it against every CV you've uploaded, and — for the ones
worth chasing — generates a tailored CV and cover letter as PDFs. Applications
you send are tracked through to offer or rejection.

---

## How it works

```
                 ┌──────────────┐
  LinkedIn URL ─▶│ scrapeWorker │─▶ jobs.status = scraped
  or pasted text └──────────────┘
                        │
                        ▼
                 ┌──────────────┐   embeds the job, RAG-matches it against
                 │  scoreWorker │   your CV chunks, writes job_cv_matches
                 └──────────────┘
                        │
              score ≥ 70 → recommended
              score < 70 → low_match
                        │
                 (you pick a CV)
                        ▼
                 ┌──────────────┐   Fireworks drafts the documents,
                 │ docgenWorker │   Puppeteer renders them to PDF
                 └──────────────┘
                        │
                        ▼
                 jobs.status = ready
```

CVs run through their own pipeline on upload (`cvWorker`): text extraction,
a validity check, a quality assessment, section extraction, chunking, and
embedding into `cv_chunks` for retrieval during scoring. Low-quality CVs get
an interactive enhancement flow instead of being silently accepted.

A digest scheduler emails a periodic summary of new matches, and an optional
Gmail integration watches your inbox for LinkedIn job alerts and ingests them
automatically.

Progress on every long-running step streams to the UI over SSE
(`/cv/:id/status-stream`, `/jobs/:id/status-stream`).

## Stack

| Layer     | Choice                                                        |
|-----------|---------------------------------------------------------------|
| Frontend  | React 19, Vite, Tailwind v4, zustand, react-router 7           |
| Backend   | Express 5, BullMQ (Redis), Supabase JS                        |
| Database  | Supabase Postgres + pgvector                                  |
| Storage   | Supabase Storage (`cvs`, `documents` buckets)                 |
| AI        | Groq (parsing, scoring), Fireworks (document generation)      |
| PDFs      | Puppeteer + headless Chrome                                   |

---

## Prerequisites

- Node.js 20+
- A Redis instance (`docker run -p 6379:6379 redis`)
- A Supabase project
- Chrome or Chromium on the machine running the backend (Puppeteer renders the
  PDFs; `puppeteer-core` does not bundle a browser)
- API keys for [Groq](https://console.groq.com) and
  [Fireworks](https://fireworks.ai)
- A LinkedIn scraper service reachable at `SCRAPER_URL` (only needed for URL
  submissions — pasting a job description works without it)

## Setup

### 1. Database

Run [`backend/db/schema.sql`](backend/db/schema.sql) in the Supabase SQL editor.
It creates all seven tables, the `match_cv_chunks` vector search function, RLS
policies, and the two storage buckets.

### 2. Embedding function

Scoring needs the `embed` edge function:

```bash
supabase functions deploy embed
```

Its source is in [`supabase/functions/embed`](supabase/functions/embed). It uses
Supabase's built-in `gte-small` model (384 dimensions). If you swap the model,
update the vector size in `schema.sql` to match — in both `cv_chunks.embedding`
and the `match_cv_chunks` signature.

### 3. Backend

```bash
cd backend
cp .env.example .env    # then fill it in
npm install
npm run dev             # http://localhost:3000
```

`npm run dev` starts the API and all six workers in one process. Every variable
in `.env.example` is documented inline; the Gmail and webhook blocks are
optional.

### 4. Frontend

```bash
cd frontend
cp .env.example .env    # optional — defaults to http://localhost:3000
npm install
npm run dev             # http://localhost:5173
```

---

## Scripts

**Backend**

| Command         | Does                                     |
|-----------------|------------------------------------------|
| `npm run dev`   | API + workers with nodemon reload        |
| `npm start`     | Same, for process managers               |
| `npm test`      | Unit tests (`node --test`)               |

**Frontend**

| Command           | Does                              |
|-------------------|-----------------------------------|
| `npm run dev`     | Vite dev server                   |
| `npm run build`   | Typecheck + production build      |
| `npm run lint`    | ESLint                            |
| `npm test`        | Vitest                            |
| `npm run preview` | Serve the production build        |

---

## Layout

```
backend/
  db/schema.sql        Full Postgres schema — run this first
  src/
    config/            Supabase, Redis and Google OAuth clients
    middleware/        Bearer-token auth (also accepts ?token= for SSE)
    queues/            BullMQ queue definitions
    routes/            auth, cv, jobs, documents, applications, webhooks
    workers/           cv, scrape, score, docgen, digest + scheduler
    utils/             Job description formatting
frontend/
  src/
    api/               Axios wrappers — resolve to { data, error }, never throw
    components/        ui/ primitives, jobs/ and applications/ feature parts
    hooks/useSSE.js    Server-sent event subscription
    lib/               Shared status vocabulary and formatters
    pages/             One file per route
    store/             zustand stores
supabase/functions/    Edge functions
DESIGN.md              Design system — colours, type scale, component specs
```

## Notes

- **Auth.** Supabase issues the JWT; the backend validates it on every request.
  SSE endpoints accept the token as a query parameter because `EventSource`
  cannot set headers.
- **API responses.** The frontend `api/*` modules never throw — they resolve to
  `{ data, error }`. A 401 anywhere clears the token and bounces to `/login`.
- **Workers share the API process.** Fine for a single box. To scale, split the
  worker imports out of `src/index.js` into their own entrypoint and run them
  separately.
- **Design.** `DESIGN.md` is the source of truth for the UI. Tokens are wired
  into Tailwind through `@theme` in `frontend/src/index.css`.
