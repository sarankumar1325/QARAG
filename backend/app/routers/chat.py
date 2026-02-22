"""Chat router - handles question answering"""

import re
import uuid
import time
from typing import Dict, List
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models import ChatRequest, ChatResponse, ChatMessage, Source, SourceType
from app.services.document_store import document_store
from app.services.tavily_search import tavily_search_service
from app.services.llm_service import llm_service


router = APIRouter(prefix="/chat", tags=["chat"])

# In-memory conversation store (thread isolation - each thread is independent)
conversations: Dict[str, List[ChatMessage]] = {}


def detect_urls(message: str) -> List[str]:
    """Extract URLs from user message"""
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    return re.findall(url_pattern, message)


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Process a chat query and return an answer

    Thread Isolation:
    - Each conversation has its own history
    - doc_ids filters to documents uploaded to THIS thread only
    - New conversations don't inherit old context

    Source Priority:
    1. URLs in message → Tavily Extract
    2. Uploaded PDFs → pgvector similarity (thread-specific only)
    """
    start_time = time.time()

    try:
        # Get or create conversation (isolated per thread)
        conversation_id = request.conversation_id or str(uuid.uuid4())
        if conversation_id not in conversations:
            conversations[conversation_id] = []

        print(f"[CHAT] conversation_id: {conversation_id}")
        print(f"[CHAT] doc_ids received: {request.doc_ids}")

        # Add user message to THIS conversation only
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
                has_uploaded_documents=bool(request.doc_ids),
            )
            use_web_search = request.force_web_search or planner_use_web
            if use_web_search:
                web_sources = tavily_search_service.search(
                    query=planner_query if planner_query else request.message,
                    n_results=request.max_web_sources,
                )

        # PRIORITY 2: Search internal documents (thread-specific only)
        # Only search documents uploaded to THIS thread via doc_ids
        search_kwargs = {"query": request.message, "n_results": request.max_internal_sources}
        if request.doc_ids:
            search_kwargs["doc_ids"] = request.doc_ids

        internal_sources = await document_store.search(**search_kwargs)

        # Filter and combine sources
        # For fresh-news queries with web results, suppress weak doc fallback chunks.
        internal_threshold = 0.75 if (use_web_search and web_sources) else 0.4
        internal_filtered = [s for s in internal_sources if s.relevance_score >= internal_threshold]
        web_filtered = [s for s in web_sources if s.relevance_score >= 0.4]

        all_sources = internal_filtered + web_filtered
        all_sources.sort(key=lambda x: x.relevance_score, reverse=True)

        # Generate response
        answer = llm_service.generate_response(
            query=request.message,
            internal_sources=internal_filtered,
            web_sources=web_filtered,
            conversation_history=conversations[conversation_id][:-1],  # Only THIS conversation's history
            has_uploaded_documents=bool(request.doc_ids),
        )

        # Calculate confidence score
        confidence_score = llm_service.calculate_confidence_score(
            internal_sources=internal_filtered, web_sources=web_filtered
        )

        # Add assistant message to THIS conversation only
        assistant_message = ChatMessage(
            role="assistant", content=answer, timestamp=datetime.utcnow()
        )
        conversations[conversation_id].append(assistant_message)

        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)

        return ChatResponse(
            answer=answer,
            sources=all_sources,
            conversation_id=conversation_id,
            confidence_score=confidence_score,
            processing_time_ms=processing_time_ms,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get conversation history (thread-specific)"""
    if conversation_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "conversation_id": conversation_id,
        "messages": conversations[conversation_id],
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation (thread deletion)"""
    if conversation_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")

    del conversations[conversation_id]
    return {"message": "Conversation deleted", "conversation_id": conversation_id}


@router.get("/conversations")
async def list_conversations():
    """List all conversations"""
    return {
        "conversations": [
            {
                "conversation_id": conv_id,
                "message_count": len(messages),
                "last_message": messages[-1].timestamp if messages else None,
            }
            for conv_id, messages in conversations.items()
        ]
    }
