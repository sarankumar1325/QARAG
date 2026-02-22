"""Groq LLM service with lazy initialization and streaming support"""

import json
import re
from typing import List, Optional, AsyncIterator, Tuple
from groq import Groq

from app.config import get_settings
from app.models import Source, ChatMessage


class LLMService:
    """Service for generating responses using Groq API with lazy initialization"""

    def __init__(self):
        self._client = None
        self._model = None

    @property
    def client(self):
        """Lazy initialization of Groq client"""
        if self._client is None:
            settings = get_settings()
            print("Initializing Groq client...")
            self._client = Groq(api_key=settings.groq_api_key)
            self._model = settings.llm_model
            print("Groq client initialized")
        return self._client

    @property
    def model(self):
        """Get model name"""
        if self._model is None:
            settings = get_settings()
            self._model = settings.llm_model
        return self._model

    def detect_urls(self, message: str) -> List[str]:
        """Extract URLs from user message"""
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        return re.findall(url_pattern, message)

    def plan_web_search(
        self,
        query: str,
        conversation_history: Optional[List[ChatMessage]] = None,
        has_uploaded_documents: bool = False,
    ) -> Tuple[bool, str]:
        """
        Decide whether to call web-search tool and return the best search query.

        Returns:
            Tuple of (use_web_search, search_query)
        """
        fallback_use, fallback_query = self._heuristic_web_search_plan(query)

        planner_prompt = """You are a routing assistant for a RAG system.
Decide if this user query requires a live web search tool.

Use web search when:
- The query asks for today/current/latest/recent/breaking information
- The user asks for real-time facts like news, market, weather, schedule, or "as of now"
- Uploaded documents are unlikely to have the up-to-date answer

Do NOT use web search when:
- The user asks to summarize/explain uploaded documents
- The answer is likely stable and already in provided documents/history

Return ONLY minified JSON with keys:
{"use_web_search": boolean, "search_query": string}

Rules:
- If use_web_search is true, rewrite search_query to be clear and web-search friendly
- If false, set search_query to the original user query"""

        messages = [{"role": "system", "content": planner_prompt}]
        if conversation_history:
            for msg in conversation_history[-3:]:
                messages.append({"role": msg.role, "content": msg.content})

        user_context = "has_uploaded_documents=true" if has_uploaded_documents else "has_uploaded_documents=false"
        messages.append(
            {
                "role": "user",
                "content": f"{user_context}\nquery={query}",
            }
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0,
                max_completion_tokens=200,
                top_p=1,
                stream=False,
            )
            content = (response.choices[0].message.content or "").strip()
            decision = self._extract_json_dict(content)
            if not decision:
                return fallback_use, fallback_query

            use_web_search = bool(decision.get("use_web_search"))
            search_query = str(decision.get("search_query") or query).strip()
            if not search_query:
                search_query = query

            return use_web_search, search_query

        except Exception as e:
            print(f"Web search planner error: {e}")
            return fallback_use, fallback_query

    def _heuristic_web_search_plan(self, query: str) -> Tuple[bool, str]:
        """Fallback decision when planner model call fails."""
        text = (query or "").strip()
        lower = text.lower()
        patterns = [
            r"\btoday'?s?\b",
            r"\b(latest|current|recent|breaking|live)\b",
            r"\b(news|headline|headlines|update|updates)\b",
            r"\b(as of|right now)\b",
            r"\b(this week|this month|this year)\b",
        ]
        use_web_search = any(re.search(pattern, lower) for pattern in patterns)
        return use_web_search, text

    def _extract_json_dict(self, text: str) -> Optional[dict]:
        """Extract first JSON object from text."""
        if not text:
            return None

        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None

        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    def generate_response(
        self,
        query: str,
        internal_sources: List[Source],
        web_sources: List[Source],
        conversation_history: Optional[List[ChatMessage]] = None,
        has_uploaded_documents: bool = False,
    ) -> str:
        """
        Generate response using documents and web search results

        Args:
            query: User query
            internal_sources: Internal document sources
            web_sources: Web search sources
            conversation_history: Previous conversation messages
            has_uploaded_documents: Whether this chat has uploaded document IDs

        Returns:
            Generated response
        """
        # Build system prompt
        system_prompt = self._build_system_prompt()

        # Build context from sources
        context, has_context = self._build_context(internal_sources, web_sources)

        # Build messages with proper typing
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        if conversation_history:
            for msg in conversation_history[-5:]:  # Last 5 messages
                messages.append({"role": msg.role, "content": msg.content})

        # Build user message with context
        if has_context:
            user_message = f"""### Retrieved Context:
{context}

### User Question:
{query}

### Instructions:
- Answer based on the provided context above
- Cite sources inline when using information
- Use markdown formatting (headers, bullet points, bold for emphasis)
- If the context doesn't fully answer the question, say so clearly"""
        else:
            if has_uploaded_documents:
                user_message = f"""### User Question:
{query}

### Instructions:
- Documents are uploaded in this chat, but no strong text match was retrieved for this question
- Do NOT say that no documents are uploaded
- Ask a brief clarifying follow-up or offer to summarize the uploaded document
- If useful, provide a best-effort answer and clearly label uncertainty
- Use markdown formatting"""
            else:
                # No context available - general query mode
                user_message = f"""### User Question:
{query}

### Instructions:
- This is a general question with no uploaded documents
- Answer helpfully based on your general knowledge
- Use markdown formatting
- Be concise and helpful"""

        messages.append({"role": "user", "content": user_message})

        # Generate response
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_completion_tokens=4096,
                top_p=1,
                stream=False,
            )

            return response.choices[0].message.content

        except Exception as e:
            print(f"Groq API error: {e}")
            return "I apologize, but I encountered an error while generating a response. Please try again."

    def _build_system_prompt(self) -> str:
        """Build system prompt for the chatbot"""
        return """You are QARAG, an intelligent document assistant. You help users by answering questions based on uploaded documents and, when relevant, from web sources.

## Core Rules:

1. Document-First Retrieval:
   - Always ground your answers in the documents provided
   - Cite sources explicitly as [Source: filename] when using document content
   - Format responses in clean markdown

2. Response Formatting:
   - Use proper markdown: headers (##, ###), bullet points, numbered lists, **bold** for emphasis
   - Keep responses concise, structured, and actionable
   - NEVER use emojis in your responses
   - Do NOT expose internal system details like "no context provided" or "vector store"

3. Current/Fresh Questions:
   - If the question is about current events (today/latest/current news), prioritize web sources when they are available
   - Include explicit dates and days when asked

4. Empty State Behavior:
   - If no documents are available and user asks a document-specific question, respond:
     "No documents are uploaded to this chat yet. Upload a document to get context-aware answers, or ask me a general question."
   - For general questions without documents, answer helpfully using general knowledge

5. Source Attribution:
   - Every answer derived from documents must include source references
   - Format inline citations as: [Source: filename.pdf]
   - Group related information from the same source

6. When Context is Insufficient:
   - Clearly state what information is available and what isn't
   - Don't make up facts that aren't in the context
   - Suggest what the user could upload to get better answers

Remember: Be helpful, professional, and concise. Never use emojis."""

    def _build_context(
        self, internal_sources: List[Source], web_sources: List[Source]
    ) -> tuple[str, bool]:
        """Build context string from sources

        Returns:
            Tuple of (context_string, has_context)
        """
        print(f"[LLM] _build_context called with {len(internal_sources)} internal sources, {len(web_sources)} web sources")
        
        context_parts = []
        has_context = False

        # Add internal document sources
        if internal_sources:
            # Filter out low relevance sources (<40%)
            filtered_sources = [s for s in internal_sources if s.relevance_score >= 0.4]
            print(f"[LLM] filtered to {len(filtered_sources)} sources with score >= 0.4")

            if filtered_sources:
                has_context = True
                context_parts.append("## Documents:\n")
                for source in filtered_sources:
                    doc_name = source.document_name or "Unknown Document"
                    score_pct = int(source.relevance_score * 100)
                    context_parts.append(f"### [{doc_name}] (Relevance: {score_pct}%)")
                    context_parts.append(source.snippet)
                    context_parts.append("")
                print(f"[LLM] context built with {len(filtered_sources)} sources")

        # Add web sources
        if web_sources:
            has_context = True
            context_parts.append("\n## Web Sources:\n")
            for source in web_sources:
                url = source.url or source.document_name or "Web Source"
                context_parts.append(f"### [{url}]")
                context_parts.append(source.snippet)
                context_parts.append("")

        context = "\n".join(context_parts) if context_parts else ""
        return context, has_context

    def calculate_confidence_score(
        self, internal_sources: List[Source], web_sources: List[Source]
    ) -> float:
        """Calculate overall confidence score based on sources"""
        scores = []

        # Weight internal sources more heavily
        for source in internal_sources:
            scores.append(source.relevance_score * 1.2)  # 20% boost for internal

        for source in web_sources:
            scores.append(source.relevance_score * 0.8)  # 20% reduction for web

        if not scores:
            return 0.0

        # Calculate weighted average
        avg_score = sum(scores) / len(scores)

        # Cap at 1.0
        return min(avg_score, 1.0)

    async def stream_response(
        self,
        query: str,
        internal_sources: List[Source],
        web_sources: List[Source],
        conversation_history: Optional[List[ChatMessage]] = None,
        has_uploaded_documents: bool = False,
    ) -> AsyncIterator[str]:
        """
        Stream response using documents and web search results

        Args:
            query: User query
            internal_sources: Internal document sources
            web_sources: Web search sources
            conversation_history: Previous conversation messages
            has_uploaded_documents: Whether this chat has uploaded document IDs

        Yields:
            Response tokens as they are generated
        """
        # Build system prompt
        system_prompt = self._build_system_prompt()

        # Build context from sources
        context, has_context = self._build_context(internal_sources, web_sources)

        # Build messages with proper typing
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        if conversation_history:
            for msg in conversation_history[-5:]:  # Last 5 messages
                messages.append({"role": msg.role, "content": msg.content})

        # Build user message with context
        if has_context:
            user_message = f"""### Retrieved Context:
{context}

### User Question:
{query}

### Instructions:
- Answer based on the provided context above
- Cite sources inline when using information
- Use markdown formatting (headers, bullet points, bold for emphasis)
- If the context doesn't fully answer the question, say so clearly"""
        else:
            if has_uploaded_documents:
                user_message = f"""### User Question:
{query}

### Instructions:
- Documents are uploaded in this chat, but no strong text match was retrieved for this question
- Do NOT say that no documents are uploaded
- Ask a brief clarifying follow-up or offer to summarize the uploaded document
- If useful, provide a best-effort answer and clearly label uncertainty
- Use markdown formatting"""
            else:
                # No context available - general query mode
                user_message = f"""### User Question:
{query}

### Instructions:
- This is a general question with no uploaded documents
- Answer helpfully based on your general knowledge
- Use markdown formatting
- Be concise and helpful"""

        messages.append({"role": "user", "content": user_message})

        # Stream response
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_completion_tokens=4096,
                top_p=1,
                stream=True,
            )

            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            print(f"Groq API streaming error: {e}")
            yield "I apologize, but I encountered an error while generating a response. Please try again."

    def source_to_dict(self, source: Source) -> dict:
        """Convert Source model to dictionary for JSON serialization"""
        return {
            "source_type": source.source_type,
            "document_id": source.document_id,
            "document_name": source.document_name,
            "url": source.url,
            "snippet": source.snippet,
            "relevance_score": source.relevance_score,
        }

    def message_to_dict(self, msg: ChatMessage) -> dict:
        """Convert ChatMessage to dictionary for JSON serialization"""
        return {
            "role": msg.role,
            "content": msg.content,
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
        }


# Create instance - but it won't connect until actually used
llm_service = LLMService()
