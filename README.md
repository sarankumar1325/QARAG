# QARAG

QARAG is a full-stack document assistant. Upload files (PDF / DOCX / Markdown / TXT) or paste URLs, ask questions, and get grounded, streamed answers with cited sources.

**Live deployments**
- Frontend: [Vercel](https://vercel.com) — React + Vite SPA
- Backend: [Render](https://render.com) — FastAPI service

---

## Table of Contents

- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
  - [Backend](#backend-setup)
  - [Frontend](#frontend-setup)
- [Deployment](#deployment)
  - [Backend on Render](#backend-on-render)
  - [Frontend on Vercel](#frontend-on-vercel)
- [API Reference](#api-reference)
- [Core Flows](#core-flows)
- [Testing](#testing)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (Vercel)                         │
│                                                              │
│   React + Vite SPA                                           │
│   ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│   │ ChatSidebar│  │ChatInterface│  │  DocumentUploadPanel  │ │
│   │  (threads) │  │ (SSE stream)│  │  (file / URL upload)  │ │
│   └────────────┘  └─────────────┘  └──────────────────────┘ │
│          │               │                   │               │
│          └───────────────┴───────────────────┘               │
│                          │  HTTPS / SSE                      │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                   FastAPI Backend (Render)                    │
│                                                              │
│  POST /documents/upload ──► DocumentProcessor                │
│  POST /documents/url    ──► DocumentProcessor (HTML fetch)   │
│                                 │                            │
│                         chunks written to DB                 │
│                                                              │
│  POST /chat/stream ──────────────────────────────────────►   │
│    1. URL in message?  ──► Tavily Extract                    │
│    2. LLM planner      ──► decide web search needed?         │
│       └─ yes ──────────────► Tavily Search                   │
│    3. Thread doc search ──► PostgreSQL full-text search      │
│    4. Merge & rank sources                                   │
│    5. Groq LLM streaming ──► SSE token stream                │
│         (llama-3.3-70b-versatile)                            │
│                                                              │
│  SSE events: metadata → sources → token… → done | error     │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│              Neon PostgreSQL (managed cloud)                  │
│                                                              │
│  documents table          document_chunks table              │
│  ─────────────            ────────────────────               │
│  id, filename,            id, doc_id, chunk_index,           │
│  doc_type, status,        content (GIN FTS index),           │
│  chunk_count, …           metadata JSONB, …                  │
└──────────────────────────────────────────────────────────────┘
```

### Request flow — streaming chat

```
User sends message
      │
      ▼
Detect URLs in message
  ├─ YES → Tavily Extract (scrape URL content)
  └─ NO  → LLM Planner (Groq, zero-temp)
               ├─ needs web search → Tavily Search
               └─ no web search needed
      │
      ▼
Search thread-scoped documents (doc_ids)
  └─ PostgreSQL full-text + substring match
  └─ Fallback: first N chunks if no lexical match
      │
      ▼
Merge & rank: internal sources + web sources
  └─ Higher threshold (0.75) when web search dominates
      │
      ▼
Stream Groq LLM response (llama-3.3-70b-versatile)
  └─ SSE events: metadata → sources → token… → done
```

---

## Repository Layout

```
QARAG/
├── backend/                    # FastAPI backend (deployed to Render)
│   ├── app/
│   │   ├── routers/
│   │   │   ├── chat.py         # POST /chat/ (non-streaming)
│   │   │   ├── chat_stream.py  # POST /chat/stream (SSE)
│   │   │   └── documents.py    # Document upload / list / delete
│   │   ├── services/
│   │   │   ├── document_processor.py  # PDF, DOCX, MD, TXT, HTML → chunks
│   │   │   ├── document_store.py      # PostgreSQL full-text search store
│   │   │   ├── llm_service.py         # Groq streaming + web-search planner
│   │   │   └── tavily_search.py       # Tavily search & extract
│   │   ├── config.py           # Pydantic settings (env vars)
│   │   ├── database.py         # asyncpg connection pool (Neon)
│   │   ├── models.py           # Pydantic request/response models
│   │   └── main.py             # App factory, CORS, lifespan
│   ├── tests/
│   ├── .env.example
│   └── pyproject.toml
├── frontend/
│   └── qarag/                  # React + Vite SPA (deployed to Vercel)
│       ├── src/
│       │   ├── components/
│       │   │   ├── ChatInterface.jsx
│       │   │   ├── ChatSidebar.jsx
│       │   │   ├── DocumentDrawer.jsx
│       │   │   ├── DocumentUploadPanel.jsx
│       │   │   └── Header.jsx
│       │   ├── services/
│       │   │   └── api.js       # Fetch wrapper (VITE_API_BASE_URL)
│       │   ├── App.jsx
│       │   └── main.jsx
│       └── package.json
├── vercel.json                  # Vercel build config
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Frontend framework | React 19, Vite 7 |
| Auth | Clerk (`@clerk/clerk-react`) |
| UI / animation | Framer Motion, GSAP, Lucide React |
| Markdown rendering | react-markdown, remark-gfm, react-syntax-highlighter |
| Backend framework | FastAPI, uvicorn |
| Python packaging | uv (requires Python >= 3.13) |
| Database | PostgreSQL on Neon (asyncpg, full-text search GIN index) |
| LLM | Groq API — `llama-3.3-70b-versatile` |
| Web retrieval | Tavily API (search + extract) |
| Document parsing | pdfplumber, python-docx, BeautifulSoup4, lxml |
| Text chunking | LangChain `RecursiveCharacterTextSplitter` |

---

## Environment Variables

### Backend (`backend/.env`)

```env
GROQ_API_KEY=your_groq_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
LLM_MODEL=llama-3.3-70b-versatile
MAX_DOCUMENT_SIZE_MB=50
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

Copy the example file to get started:

```bash
cp backend/.env.example backend/.env
```

### Frontend (`frontend/qarag/.env`)

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

For local development, point `VITE_API_BASE_URL` at `http://localhost:8000`.

---

## Local Development

### Backend Setup

Requires Python >= 3.13 and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync
cp .env.example .env
# fill in your API keys and DATABASE_URL in .env
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Available locally at:

| URL | Description |
|---|---|
| `http://localhost:8000/` | Health check |
| `http://localhost:8000/health` | Health check (JSON) |
| `http://localhost:8000/docs` | Swagger / OpenAPI UI |
| `http://localhost:8000/redoc` | ReDoc |

Database tables (`documents`, `document_chunks`) are created automatically on first startup.

### Frontend Setup

Requires Node.js >= 18.

```bash
cd frontend/qarag
npm install
# create .env.local with:
#   VITE_API_BASE_URL=http://localhost:8000
#   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

## Deployment

### Backend on Render

1. Create a new **Web Service** on Render pointing to this repository.
2. Set **Root Directory** to `backend`.
3. Set **Build Command**: `pip install uv && uv sync`
4. Set **Start Command**: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add all backend environment variables in the Render dashboard (see [Environment Variables](#environment-variables)).
6. Render will assign a public URL — copy it for the frontend config.

### Frontend on Vercel

The root `vercel.json` configures the build:

```json
{
  "buildCommand": "npm run vercel-build",
  "outputDirectory": "frontend/qarag/dist"
}
```

1. Import the repository into Vercel.
2. Add the following environment variables in the Vercel dashboard:
   - `VITE_API_BASE_URL` — your Render backend URL (e.g. `https://qarag-api.onrender.com`)
   - `VITE_CLERK_PUBLISHABLE_KEY` — your Clerk publishable key
3. Deploy. Vercel will run `npm run vercel-build` from the root and serve `frontend/qarag/dist`.

> **CORS**: The backend currently allows all origins (`allow_origins=["*"]`). For production, restrict this to your Vercel domain.

---

## API Reference

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/` | Root health check |
| GET | `/health` | Health check with service status |

### Documents

| Method | Path | Description |
|---|---|---|
| POST | `/documents/upload` | Upload a file (PDF / DOCX / MD / TXT) |
| POST | `/documents/url` | Ingest a web URL |
| GET | `/documents/` | List all documents |
| GET | `/documents/{doc_id}` | Get document metadata |
| DELETE | `/documents/{doc_id}` | Delete document and its chunks |
| GET | `/documents/stats/overview` | Aggregate stats |

### Chat

| Method | Path | Description |
|---|---|---|
| POST | `/chat/` | Non-streaming chat |
| POST | `/chat/stream` | Streaming chat via SSE |
| GET | `/chat/conversations` | List conversations |
| GET | `/chat/conversations/{id}` | Get conversation history |
| DELETE | `/chat/conversations/{id}` | Delete conversation |

#### `/chat/stream` request body

```json
{
  "message": "What does section 3 say about compliance?",
  "conversation_id": "uuid-or-null",
  "doc_ids": ["uuid1", "uuid2"],
  "max_internal_sources": 5,
  "max_web_sources": 3,
  "force_web_search": false
}
```

`doc_ids` scopes retrieval to documents uploaded in the current thread. Pass an empty array `[]` to disable document search entirely.

#### SSE event types

| Event | Payload | Description |
|---|---|---|
| `metadata` | `{ conversation_id, timestamp }` | Sent immediately on connection |
| `sources` | `{ sources[], internal_count, web_count }` | Retrieved sources before LLM generation |
| `token` | `{ content }` | Individual LLM output tokens |
| `done` | `{ answer, confidence_score, processing_time_ms, usage }` | Final event with full response |
| `error` | `{ error, conversation_id }` | Error information |

---

## Core Flows

### Document ingestion

```
Upload file / URL
      │
      ▼
DocumentProcessor extracts text
  PDF → pdfplumber
  DOCX → python-docx (paragraphs + tables)
  MD / TXT → decoded as-is
  URL → requests + BeautifulSoup (strips nav/footer/scripts)
      │
      ▼
RecursiveCharacterTextSplitter
  chunk_size=1000, chunk_overlap=200
      │
      ▼
Stored in PostgreSQL
  documents + document_chunks tables
  GIN index on content for full-text search
```

### Thread isolation

Each chat thread has its own `conversation_id` and its own list of uploaded `doc_ids`. Document search is filtered to only the `doc_ids` for that thread — documents from other threads are never surfaced.

### Web search routing

The LLM planner (Groq, temperature=0) decides whether a query needs a live web search:

- **Triggers web search**: today / latest / current / breaking / news / real-time facts
- **Skips web search**: summarise/explain uploaded documents, stable factual questions

A heuristic fallback applies if the planner call fails.

---

## Testing

```bash
cd backend
uv run pytest
```

Test files are in `backend/tests/`:

| File | Coverage |
|---|---|
| `test_api.py` | FastAPI route integration tests |
| `test_document_store.py` | PostgreSQL document store |
| `test_document_processor.py` | File parsing and chunking |
| `test_database.py` | DB connection helpers |

---

## Notes

- Database tables are created automatically on backend startup — no migration step needed.
- Uploaded files are processed in FastAPI background tasks; the upload endpoint returns immediately while chunking happens asynchronously.
- Conversation history is held in-memory on the backend process. Restarting Render clears chat history (documents in PostgreSQL are unaffected).
- The Render free tier may spin down after inactivity — the first request after sleep will be slower while the service wakes up.
