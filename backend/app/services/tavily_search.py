"""Tavily web search, extract, and crawl service"""

from typing import List, Optional
from tavily import TavilyClient

from app.config import get_settings
from app.models import Source, SourceType


class TavilySearchService:
    """Service for web search, extract, and crawl using Tavily API with lazy initialization"""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        """Lazy initialization of Tavily client"""
        if self._client is None:
            settings = get_settings()
            print("Initializing Tavily client...")
            self._client = TavilyClient(api_key=settings.tavily_api_key)
            print("Tavily client initialized")
        return self._client

    def search(
        self,
        query: str,
        n_results: int = 3,
        search_depth: str = "advanced",
        include_domains: Optional[List[str]] = None,
        exclude_domains: Optional[List[str]] = None,
    ) -> List[Source]:
        """
        Perform web search using Tavily

        Args:
            query: Search query
            n_results: Number of results to return (max 10)
            search_depth: "basic", "advanced", "fast", or "ultra-fast"
            include_domains: List of domains to include
            exclude_domains: List of domains to exclude

        Returns:
            List of sources
        """
        try:
            # Perform search
            response = self.client.search(
                query=query,
                max_results=min(n_results, 10),
                search_depth=search_depth,
                include_answer=False,
                include_raw_content=False,
                include_images=False,
                include_domains=include_domains or [],
                exclude_domains=exclude_domains or [],
            )

            # Convert to Source objects
            sources = []
            for result in response.get("results", []):
                relevance_score = result.get("score", 0.5)

                source = Source(
                    source_type=SourceType.WEB_SEARCH,
                    url=result.get("url"),
                    snippet=result.get("content", "")[:500],
                    relevance_score=relevance_score,
                )
                sources.append(source)

            return sources

        except Exception as e:
            print(f"Tavily search error: {e}")
            return []

    def search_with_answer(
        self, query: str, n_results: int = 3, search_depth: str = "advanced"
    ) -> tuple:
        """
        Perform web search and get AI-generated answer

        Returns:
            Tuple of (answer, sources)
        """
        try:
            response = self.client.search(
                query=query,
                max_results=min(n_results, 10),
                search_depth=search_depth,
                include_answer=True,
                include_raw_content=False,
                include_images=False,
            )

            answer = response.get("answer", "")

            sources = []
            for result in response.get("results", []):
                source = Source(
                    source_type=SourceType.WEB_SEARCH,
                    url=result.get("url"),
                    snippet=result.get("content", "")[:500],
                    relevance_score=result.get("score", 0.5),
                )
                sources.append(source)

            return answer, sources

        except Exception as e:
            print(f"Tavily search with answer error: {e}")
            return "", []

    def extract(self, urls: List[str]) -> List[Source]:
        """
        Extract content from specific URLs using Tavily

        Args:
            urls: List of URLs to extract content from

        Returns:
            List of sources with extracted content
        """
        try:
            response = self.client.extract(urls=urls)

            sources = []
            results = response.get("results", [])

            for result in results:
                url = result.get("url", "")
                content = result.get("content", "")

                source = Source(
                    source_type=SourceType.WEB_SEARCH,
                    url=url,
                    snippet=content[:500] if content else "",
                    relevance_score=1.0,  # Direct extraction has high relevance
                )
                sources.append(source)

            return sources

        except Exception as e:
            print(f"Tavily extract error: {e}")
            return []

    def crawl(self, url: str, extract_depth: str = "advanced") -> List[Source]:
        """
        Crawl a website and extract content using Tavily

        Args:
            url: Starting URL to crawl
            extract_depth: "basic" or "advanced" extraction depth

        Returns:
            List of sources from crawled pages
        """
        try:
            response = self.client.crawl(url=url, extract_depth=extract_depth)

            sources = []
            results = response.get("results", [])

            for result in results:
                crawled_url = result.get("url", "")
                content = result.get("content", "")

                source = Source(
                    source_type=SourceType.WEB_SEARCH,
                    url=crawled_url,
                    snippet=content[:500] if content else "",
                    relevance_score=1.0,
                )
                sources.append(source)

            return sources

        except Exception as e:
            print(f"Tavily crawl error: {e}")
            return []


# Create instance - but it won't connect until actually used
tavily_search_service = TavilySearchService()
