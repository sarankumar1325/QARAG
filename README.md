# QARAG

QARAG is a full-stack document assistant that lets you upload files (PDF/DOCX/Markdown/TXT), ask questions, and get grounded answers with source context.

It supports:
- Thread-scoped document retrieval (`doc_ids` per chat thread)
- Streaming chat responses via SSE
- URL extraction + web search (Tavily)
- LLM-generated answers (Groq)
- PostgreSQL-backed document/chunk storage

## Repository Layout

```text
KB TECHNOLGIES/
├─ backend/                # FastAPI backend
│  ├─ app/
│  │  ├─ routers/          # chat, chat_stream, documents
│  │  ├─ services/         # llm, search, document processing/store
│  │  ├─ config.py
│  │  ├─ database.py
│  │  └─ main.py
│  ├─ tests/
│  ├─ .env.example
│  └─ pyproject.toml
├─ frontend/
│  └─ qarag/               # React + Vite frontend
│     ├─ src/components/
│     ├─ src/services/api.js
│     └─ package.json
└─ README.md
```

## Tech Stack

- Backend: FastAPI, asyncpg, uvicorn
- LLM: Groq API
- Web retrieval: Tavily API
- Document processing: pdfplumber, python-docx, BeautifulSoup, langchain text splitters
- Frontend: React, Vite, Framer Motion, Lucide, React Markdown

## Prerequisites

- Python `>= 3.13`
- Node.js `>= 18` (recommended)
- A PostgreSQL database URL (Neon works well)
- API keys:
  - `GROQ_API_KEY`
  - `TAVILY_API_KEY`

## 1) Backend Setup

From the project root:

```powershell
cd backend
uv sync
Copy-Item .env.example .env
```

Set values in `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
LLM_MODEL=llama-3.3-70b-versatile
MAX_DOCUMENT_SIZE_MB=50
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

Run backend:

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:
- API root: `http://127.0.0.1:8000/`
- Swagger docs: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## 2) Frontend Setup

In a new terminal:

```powershell
cd frontend/qarag
npm install
npm run dev
```

Frontend URL:
- `http://localhost:5173`

Note: frontend API base is currently hardcoded in `frontend/qarag/src/services/api.js` to:
- `http://localhost:8000`

## Core Flows

## Upload and Ask
1. Create/select a chat thread.
2. Upload one or more documents.
3. Ask questions in that thread.
4. Answers are scoped to thread documents (`doc_ids`).

## Streaming
- `POST /chat/stream` sends SSE events:
  - `metadata`
  - `sources`
  - `token`
  - `done`
  - `error`

## Current/Fresh Questions
- For queries like “today/latest/current news”, the chat flow can plan web search and fetch current web sources before answering.

## API Overview

## Health
- `GET /`
- `GET /health`

## Documents
- `POST /documents/upload`
- `POST /documents/url`
- `GET /documents/`
- `GET /documents/{doc_id}`
- `DELETE /documents/{doc_id}`
- `GET /documents/stats/overview`

## Chat
- `POST /chat/`
- `POST /chat/stream`
- `GET /chat/conversations`
- `GET /chat/conversations/{conversation_id}`
- `DELETE /chat/conversations/{conversation_id}`

## Testing

Backend tests:

```powershell
cd backend
uv run pytest
```

## Notes

- DB tables are created automatically on backend startup.
- CORS is currently permissive (`allow_origins=["*"]`) for development.
- Uploaded files are processed in background tasks and indexed into document chunks.
