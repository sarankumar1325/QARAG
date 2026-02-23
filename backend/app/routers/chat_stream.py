"""Streaming chat router - handles SSE streaming for real-time responses"""

import json
import re
import time
import uuid
from typing import Dict, List, AsyncIterator
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.models import ChatRequest, ChatMessage, Source, SourceType
from app.services.document_store import document_store
from app.services.tavily_search import tavily_search_service
from app.services.llm_service import llm_service


router = APIRouter(prefix="/chat", tags=["chat-stream"])

# In-memory conversation store (shared with non-streaming chat router)
# Import from chat router to keep state consistent
from app.routers.chat import conversations


def detect_urls(message: str) -> List[str]:
    """Extract URLs from user message"""
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    return re.findall(url_pattern, message)


def format_sse(event: str, data: dict) -> str:
    """Format data as Server-Sent Event"""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_chat_generator(request: ChatRequest) -> AsyncIterator[str]:
    """
    Generator function for SSE streaming

    Event types:
    - metadata: Initial metadata (conversation_id, timestamp)
    - sources: Retrieved sources (sent before LLM generation)
    - token: Individual text tokens from LLM
    - done: Final event with full response and usage stats
    - error: Error information

    URL Detection Logic:
    - If URL is detected in message → Use Tavily Extract (web content)
    - If no URL → Use internal document search (uploaded PDFs)
    - doc_ids parameter ensures only documents uploaded to THIS thread are searched
    """
    start_time = time.time()
    conversation_id = None
    full_response = ""
    # Enforce thread-scoped document filtering.
    # Empty list means "this thread has no documents" (no global fallback).
    thread_doc_ids = request.doc_ids if request.doc_ids is not None else []

    try:
        # Get or create conversation (thread isolation - each thread has its own history)
        conversation_id = request.conversation_id or str(uuid.uuid4())
        if conversation_id not in conversations:
            conversations[conversation_id] = []

        # Send metadata event
        yield format_sse("metadata", {
            "conversation_id": conversation_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Add user message to THIS conversation's history only
        user_message = ChatMessage(
            role="user", content=request.message, timestamp=datetime.utcnow()
        )
        conversations[conversation_id].append(user_message)

        # PRIORITY 1: URL extract OR freshness-triggered web search
        urls = detect_urls(request.message)
        web_sources = []
        use_web_search = False
        planner_query = request.message

        if urls:
            # User pasted a URL - fetch and process it
            web_sources = tavily_search_service.extract(urls=urls)
        else:
            planner_use_web, planner_query = llm_service.plan_web_search(
                query=request.message,
                conversation_history=conversations[conversation_id][:-1],
                has_uploaded_documents=bool(thread_doc_ids),
            )
            use_web_search = request.force_web_search or planner_use_web
            if use_web_search:
                web_sources = tavily_search_service.search(
                    query=planner_query if planner_query else request.message,
                    n_results=request.max_web_sources,
                )

        # PRIORITY 2: Search internal documents (thread-specific)
        # Only search documents that were uploaded to THIS thread (doc_ids)
        search_kwargs = {
            "query": request.message,
            "n_results": request.max_internal_sources,
            "doc_ids": thread_doc_ids,
        }

        internal_sources = await document_store.search(**search_kwargs)
        print(f"[CHAT_STREAM] internal_sources count: {len(internal_sources)}")
        if internal_sources:
            print(f"[CHAT_STREAM] first source: {internal_sources[0].document_name}, score: {internal_sources[0].relevance_score}")

        # Combine sources
        all_sources = []
        # For fresh-news queries with web results, suppress weak doc fallback chunks.
        internal_threshold = 0.75 if (use_web_search and web_sources) else 0.4
        internal_filtered = [s for s in internal_sources if s.relevance_score >= internal_threshold]
        web_filtered = [s for s in web_sources if s.relevance_score >= 0.4]

        print(f"[CHAT_STREAM] internal_filtered count: {len(internal_filtered)}")
        print(f"[CHAT_STREAM] web_filtered count: {len(web_filtered)}")

        all_sources = internal_filtered + web_filtered
        all_sources.sort(key=lambda x: x.relevance_score, reverse=True)

        # Send sources event (BEFORE LLM generation)
        sources_data = [llm_service.source_to_dict(s) for s in all_sources]
        yield format_sse("sources", {
            "sources": sources_data,
            "internal_count": len(internal_filtered),
            "web_count": len(web_filtered),
        })

        # Stream LLM response token by token
        async for token in llm_service.stream_response(
            query=request.message,
            internal_sources=internal_filtered,
            web_sources=web_filtered,
            conversation_history=conversations[conversation_id][:-1],  # Only THIS conversation's history
            has_uploaded_documents=bool(thread_doc_ids),
        ):
            full_response += token
            yield format_sse("token", {"content": token})

        # Calculate confidence score
        confidence_score = llm_service.calculate_confidence_score(
            internal_sources=internal_filtered, web_sources=web_filtered
        )

        # Add assistant message to THIS conversation only
        assistant_message = ChatMessage(
            role="assistant", content=full_response, timestamp=datetime.utcnow()
        )
        conversations[conversation_id].append(assistant_message)

        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)

        # Estimate token usage (rough approximation: ~4 chars per token)
        estimated_input_tokens = len(request.message) // 4 + sum(len(s.snippet) for s in all_sources) // 4
        estimated_output_tokens = len(full_response) // 4

        # Send done event with full response
        yield format_sse("done", {
            "answer": full_response,
            "conversation_id": conversation_id,
            "confidence_score": confidence_score,
            "processing_time_ms": processing_time_ms,
            "usage": {
                "prompt_tokens": estimated_input_tokens,
                "completion_tokens": estimated_output_tokens,
                "total_tokens": estimated_input_tokens + estimated_output_tokens,
            },
        })

    except Exception as e:
        error_msg = f"Error processing query: {str(e)}"
        yield format_sse("error", {
            "error": error_msg,
            "conversation_id": conversation_id,
        })


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Process a chat query and stream the response via Server-Sent Events

    Request body:
    {
        "message": "user question or URL",
        "conversation_id": "uuid or null for new",
        "doc_ids": ["uuid1", "uuid2"]  // Documents uploaded to THIS thread only
    }

    Thread Isolation:
    - Each conversation_id has its own message history
    - doc_ids filters search to documents uploaded to THIS specific thread
    - New threads don't see old thread documents

    Source Priority:
    1. URLs in message → Tavily Extract (web content)
    2. Uploaded PDFs → pgvector similarity search (thread-specific only)

    SSE Events:
    - metadata: Initial connection info
    - sources: Retrieved sources before LLM generation
    - token: Streaming text tokens
    - done: Completion with full response and stats
    - error: Error information
    """
    return StreamingResponse(
        stream_chat_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
