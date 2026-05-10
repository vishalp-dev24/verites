"""
Research Platform Python SDK

Example:
    from researchplatform import ResearchClient
    
    client = ResearchClient(api_key="your-api-key")
    result = client.research(
        query="Latest AI developments",
        mode="medium",
        session_id="session-123",
        output_schema={"type": "object", "properties": {"summary": {"type": "string"}}}
    )
"""

import requests
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum


class ResearchMode(str, Enum):
    LITE = "lite"
    MEDIUM = "medium"
    DEEP = "deep"


@dataclass
class ResearchResult:
    job_id: str
    session_id: str
    mode: str
    status: str
    confidence_score: float
    data: Dict[str, Any]
    sources: List[Dict[str, Any]]
    credits_used: int
    trace: Dict[str, Any]


class ResearchClient:
    """Research Platform API client"""
    
    def __init__(self, api_key: str, base_url: str = "https://api.researchplatform.com/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers["X-API-Key"] = api_key
    
    def research(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
        output_schema: Dict[str, Any],
        cost_controls: Optional[Dict[str, Any]] = None,
    ) -> ResearchResult:
        """Submit a research request"""
        
        payload = {
            "query": query,
            "mode": mode.value,
            "session_id": session_id,
            "output_schema": output_schema,
        }
        
        if cost_controls:
            payload["cost_controls"] = cost_controls
        
        response = self._session.post(
            f"{self.base_url}/research",
            json=payload,
            timeout=300  # 5 minute timeout for deep mode
        )
        response.raise_for_status()
        
        data = response.json()
        return ResearchResult(
            job_id=data["job_id"],
            session_id=data["session_id"],
            mode=data["mode"],
            status=data["status"],
            confidence_score=data["confidence_score"],
            data=data["data"],
            sources=data.get("sources", []),
            credits_used=data["credits_used"],
            trace=data["trace"],
        )
    
    def get_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status"""
        response = self._session.get(f"{self.base_url}/research/{job_id}")
        response.raise_for_status()
        return response.json()
    
    def estimate_cost(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
    ) -> Dict[str, Any]:
        """Get pre-research cost estimate"""
        response = self._session.post(
            f"{self.base_url}/estimate",
            json={
                "query": query,
                "mode": mode.value,
                "session_id": session_id,
            },
        )
        response.raise_for_status()
        return response.json()
    
    def get_usage(self) -> Dict[str, Any]:
        """Get billing usage stats"""
        response = self._session.get(f"{self.base_url}/usage")
        response.raise_for_status()
        return response.json()


class MCPClient:
    """MCP (Model Context Protocol) client"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None
    
    async def connect(self):
        """Connect to MCP server"""
        # In production, this uses the MCP SDK
        pass
    
    async def research(self, query: str, mode: str, session_id: str, output_schema: Dict) -> Dict:
        """Use MCP research tool"""
        # In production, this calls the MCP tool
        return await self._call_tool("research", {
            "query": query,
            "mode": mode,
            "session_id": session_id,
            "output_schema": output_schema,
            "api_key": self.api_key,
        })
    
    async def _call_tool(self, name: str, args: Dict) -> Dict:
        # Placeholder - actual implementation would use MCP SDK
        return {"result": "MCP tool called"}


__all__ = ["ResearchClient", "MCPClient", "ResearchMode", "ResearchResult"]
