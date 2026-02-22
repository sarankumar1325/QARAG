# Company Document Chatbot - Backend

A FastAPI backend for a company document chatbot that answers employee questions using internal documents (PDFs, DOCX, Markdown, text files, and web pages) powered by Groq LLM and Tavily web search.

## Features

- **Document Processing**: Upload and process PDF, DOCX, Markdown, TXT files, and website URLs
- **Vector Search**: Semantic search using sentence-transformers embeddings and ChromaDB
- **Web Search Integration**: Tavily API for supplementary web search when needed
- **LLM Integration**: Groq API for generating contextual answers
- **REST API**: Full REST API with endpoints for document management and chat

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point
│   ├── config.py               # Configuration and settings
│   ├── models.py               # Pydantic models
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── documents.py        # Document upload/list/delete endpoints
│   │   └── chat.py             # Chat/query endpoints
│   └── services/
│       ├── __init__.py
│       ├── document_processor.py   # PDF/DOCX/MD/URL processing
│       ├── embedding_service.py    # Embeddings and vector store
│       ├── tavily_search.py        # Web search service
│       └── llm_service.py          # Groq LLM integration
├── data/                       # ChromaDB persistence directory
├── documents/                  # Uploaded documents storage
├── .env                        # Environment variables (create from .env.example)
├── .env.example                # Example environment variables
├── pyproject.toml              # UV project configuration
└── README.md                   # This file
```

## Setup Instructions

### 1. Install Dependencies

Make sure you have Python 3.10+ and [uv](https://github.com/astral-sh/uv) installed.

```bash
cd backend
```

The dependencies are already installed. If you need to reinstall:

```bash
uv sync
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
GROQ_API_KEY=your_groq_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
EMBEDDING_MODEL=all-MiniLM-L6-v2
LLM_MODEL=mixtral-8x7b-32768
CHROMA_PERSIST_DIR=./data/chroma
MAX_DOCUMENT_SIZE_MB=50
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

**Get your API keys:**
- **Groq**: https://console.groq.com/keys
- **Tavily**: https://tavily.com/#api (free tier available)

### 3. Run the Application

```bash
uv run app/main.py
```

Or using uvicorn directly:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000

### 4. API Documentation

Once running, you can access:
- **Interactive API docs (Swagger UI)**: http://localhost:8000/docs
- **Alternative API docs (ReDoc)**: http://localhost:8000/redoc

## API Endpoints

### Health Check
- `GET /` - Health check
- `GET /health` - Detailed health status

### Documents
- `POST /documents/upload` - Upload a document file (PDF, DOCX, MD, TXT)
- `POST /documents/url` - Add a website URL as a document
- `GET /documents/` - List all documents
- `GET /documents/{doc_id}` - Get specific document
- `DELETE /documents/{doc_id}` - Delete a document
- `GET /documents/stats/overview` - Get document statistics

### Chat
- `POST /chat/` - Send a query and get an answer
- `GET /chat/conversations` - List all conversations
- `GET /chat/conversations/{conversation_id}` - Get conversation history
- `DELETE /chat/conversations/{conversation_id}` - Delete a conversation

## Example Usage

### Upload a Document

```bash
curl -X POST "http://localhost:8000/documents/upload" \
  -F "file=@/path/to/your/document.pdf"
```

### Add a Website URL

```bash
curl -X POST "http://localhost:8000/documents/url" \
  -F "url=https://company.com/policies/leave-policy"
```

### Ask a Question

```bash
curl -X POST "http://localhost:8000/chat/" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the leave policy?",
    "include_web_search": true
  }'
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key for LLM | Required |
| `TAVILY_API_KEY` | Tavily API key for web search | Required |
| `EMBEDDING_MODEL` | Sentence transformer model | all-MiniLM-L6-v2 |
| `LLM_MODEL` | Groq LLM model | mixtral-8x7b-32768 |
| `CHROMA_PERSIST_DIR` | Vector DB storage location | ./data/chroma |
| `CHUNK_SIZE` | Document chunk size | 1000 |
| `CHUNK_OVERLAP` | Chunk overlap size | 200 |

## Supported Document Types

- **PDF** (.pdf)
- **Word Documents** (.docx, .doc)
- **Markdown** (.md, .markdown)
- **Text Files** (.txt, .text)
- **Web Pages** (via URL)

## How It Works

1. **Document Upload**: Documents are processed, text is extracted, and split into chunks
2. **Embeddings**: Each chunk is converted to a vector embedding using sentence-transformers
3. **Vector Storage**: Embeddings are stored in ChromaDB for efficient similarity search
4. **Query Processing**: User queries are converted to embeddings and matched against document chunks
5. **Web Search**: If internal documents don't have sufficient information, Tavily performs web search
6. **Response Generation**: Groq LLM generates contextual answers using retrieved information

## Development

### Adding New Features

- **New Document Type**: Extend `document_processor.py` with a new extraction method
- **New Search Provider**: Add a new service in `services/` following the existing pattern
- **New LLM Provider**: Extend or replace `llm_service.py`

### Running Tests

```bash
uv run pytest
```

## Production Deployment

For production deployment:

1. Use a production ASGI server (e.g., Gunicorn with Uvicorn workers)
2. Set up proper authentication
3. Use a persistent database instead of in-memory stores
4. Configure CORS with specific allowed origins
5. Set up monitoring and logging
6. Use environment-specific configuration

Example:

```bash
uv run gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## License

MIT
