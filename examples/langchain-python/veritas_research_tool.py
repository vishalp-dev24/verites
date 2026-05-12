import json
import os

from langchain.tools import tool
from researchplatform import ResearchClient, ResearchMode


client = ResearchClient(
    api_key=os.environ["VERITAS_API_KEY"],
    base_url=os.getenv("VERITAS_API_URL", "http://localhost:3000/v1"),
)


@tool("veritas_research")
def veritas_research(query: str, mode: str = "medium", session_id: str = "langchain-default") -> str:
    """Run trusted multi-source web research for current facts, source checks, or structured research output."""
    result = client.research(
        query=query,
        mode=ResearchMode(mode),
        session_id=session_id,
        output_schema={
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "key_findings": {"type": "array", "items": {"type": "string"}},
                "sources": {"type": "array"},
            },
        },
    )
    return json.dumps(
        {
            "status": result.status,
            "confidence_score": result.confidence_score,
            "data": result.data,
            "sources": result.sources,
            "error": result.error,
        }
    )
