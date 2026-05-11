"""Veritas Python SDK.

Example:
    from researchplatform import ResearchClient

    client = ResearchClient(api_key="your-api-key")
    result = client.research(
        query="Latest AI developments",
        mode="medium",
        session_id="session-123",
        output_schema={"type": "object", "properties": {"summary": {"type": "string"}}},
    )
"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import requests


DEFAULT_BASE_URL = "https://api.veritas.research/v1"
DEFAULT_TIMEOUT_SECONDS = 300
DEFAULT_POLL_INTERVAL_SECONDS = 2.0
TERMINAL_STATUSES = {"success", "partial", "failed", "cancelled", "rejected"}


class ResearchMode(str, Enum):
    LITE = "lite"
    MEDIUM = "medium"
    DEEP = "deep"


@dataclass
class ResearchResult:
    job_id: str
    session_id: str = ""
    mode: str = ""
    status: str = "unknown"
    confidence_score: float = 0.0
    data: Dict[str, Any] = field(default_factory=dict)
    sources: List[Dict[str, Any]] = field(default_factory=list)
    credits_used: int = 0
    trace: Optional[Dict[str, Any]] = None
    estimated_time: Optional[int] = None
    credits_reserved: Optional[int] = None
    reason: Optional[str] = None
    estimate: Optional[Dict[str, Any]] = None
    billing: Optional[Dict[str, Any]] = None
    quality_achieved: Optional[bool] = None
    budget_reached: Optional[bool] = None
    contradictions: List[Dict[str, Any]] = field(default_factory=list)
    follow_up_queries: List[str] = field(default_factory=list)
    knowledge_gaps: List[str] = field(default_factory=list)
    processing_time_ms: Optional[int] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class ResearchTimeoutError(TimeoutError):
    def __init__(self, job_id: str, timeout: float, last_result: Optional[ResearchResult] = None):
        super().__init__(f"Research job {job_id} did not reach a terminal status within {timeout}s")
        self.job_id = job_id
        self.timeout = timeout
        self.last_result = last_result


class ResearchClient:
    """Veritas API client."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
        request_timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.poll_interval = poll_interval
        self.request_timeout = request_timeout
        self._session = requests.Session()
        self._session.headers["X-API-Key"] = api_key

    def research(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
        output_schema: Optional[Dict[str, Any]] = None,
        cost_controls: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        poll_interval: Optional[float] = None,
    ) -> ResearchResult:
        """Submit a research request and poll until it reaches a terminal status."""

        submitted = self.submit(
            query=query,
            mode=mode,
            session_id=session_id,
            output_schema=output_schema,
            cost_controls=cost_controls,
        )
        if self._is_terminal_status(submitted.status):
            return submitted

        return self.wait_for_result(
            submitted.job_id,
            timeout=timeout,
            poll_interval=poll_interval,
            initial_result=submitted,
        )

    def submit(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
        output_schema: Optional[Dict[str, Any]] = None,
        cost_controls: Optional[Dict[str, Any]] = None,
    ) -> ResearchResult:
        """Submit a research request and return the queued job metadata."""

        payload = {
            "query": query,
            "mode": self._mode_value(mode),
            "session_id": session_id,
            "output_schema": output_schema or {},
        }

        if cost_controls:
            payload["cost_controls"] = self._normalize_cost_controls(cost_controls)

        response = self._session.post(
            f"{self.base_url}/research",
            json=payload,
            timeout=self.request_timeout,
        )
        if self._is_rejected_response(response):
            return self._to_result(response.json())

        response.raise_for_status()
        return self._to_result(response.json())

    def submit_research(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
        output_schema: Optional[Dict[str, Any]] = None,
        cost_controls: Optional[Dict[str, Any]] = None,
    ) -> ResearchResult:
        """Alias for submit()."""

        return self.submit(
            query=query,
            mode=mode,
            session_id=session_id,
            output_schema=output_schema,
            cost_controls=cost_controls,
        )

    def wait_for_result(
        self,
        job_id: str,
        timeout: Optional[float] = None,
        poll_interval: Optional[float] = None,
        initial_result: Optional[ResearchResult] = None,
    ) -> ResearchResult:
        """Poll a research job until it reaches a terminal status."""

        timeout = self.timeout if timeout is None else timeout
        poll_interval = self.poll_interval if poll_interval is None else poll_interval
        started_at = time.monotonic()
        last_result = initial_result

        while True:
            if last_result and self._is_terminal_status(last_result.status):
                return last_result

            remaining = timeout - (time.monotonic() - started_at)
            if remaining <= 0:
                raise ResearchTimeoutError(job_id, timeout, last_result)

            time.sleep(min(poll_interval, remaining))
            last_result = self.status(job_id)

    def status(self, job_id: str) -> ResearchResult:
        """Get a job status as a ResearchResult."""

        response = self._session.get(
            f"{self.base_url}/research/{job_id}",
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        return self._to_result(response.json())

    def get_status(self, job_id: str) -> Dict[str, Any]:
        """Get raw job status."""

        response = self._session.get(
            f"{self.base_url}/research/{job_id}",
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        return response.json()

    def estimate_cost(
        self,
        query: str,
        mode: ResearchMode,
        session_id: str,
    ) -> Dict[str, Any]:
        """Get pre-research cost estimate."""

        response = self._session.post(
            f"{self.base_url}/estimate",
            json={
                "query": query,
                "mode": self._mode_value(mode),
                "session_id": session_id,
            },
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        return response.json()

    def get_usage(self) -> Dict[str, Any]:
        """Get billing usage stats."""

        response = self._session.get(
            f"{self.base_url}/usage",
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        return response.json()

    def _to_result(self, data: Dict[str, Any]) -> ResearchResult:
        return ResearchResult(
            job_id=data.get("job_id") or data.get("jobId"),
            session_id=data.get("session_id") or data.get("sessionId") or "",
            mode=data.get("mode") or "",
            status=data.get("status") or "unknown",
            confidence_score=data.get("confidence_score") or data.get("confidenceScore") or 0.0,
            data=data.get("data") or {},
            sources=data.get("sources") or [],
            credits_used=data.get("credits_used") or data.get("creditsUsed") or 0,
            trace=data.get("trace"),
            estimated_time=data.get("estimated_time"),
            credits_reserved=data.get("credits_reserved"),
            reason=data.get("reason"),
            estimate=data.get("estimate"),
            billing=data.get("billing"),
            quality_achieved=data.get("quality_achieved"),
            budget_reached=data.get("budget_reached"),
            contradictions=data.get("contradictions") or [],
            follow_up_queries=data.get("follow_up_queries") or [],
            knowledge_gaps=data.get("knowledge_gaps") or [],
            processing_time_ms=data.get("processing_time_ms"),
            created_at=data.get("created_at"),
            completed_at=data.get("completed_at"),
            error=data.get("error"),
        )

    def _is_rejected_response(self, response: requests.Response) -> bool:
        if response.status_code < 400:
            return False
        try:
            data = response.json()
        except ValueError:
            return False

        return data.get("status") == "rejected" and bool(data.get("job_id"))

    def _is_terminal_status(self, status: str) -> bool:
        return status in TERMINAL_STATUSES

    def _mode_value(self, mode: ResearchMode) -> str:
        return mode.value if isinstance(mode, ResearchMode) else str(mode)

    def _normalize_cost_controls(self, cost_controls: Dict[str, Any]) -> Dict[str, Any]:
        field_map = {
            "maxBudgetPaise": "max_budget_paise",
            "fallbackMode": "fallback_mode",
            "qualityThreshold": "quality_threshold",
            "maxIterations": "max_iterations",
        }
        return {
            field_map.get(key, key): value
            for key, value in cost_controls.items()
            if value is not None
        }


class MCPClient:
    """MCP (Model Context Protocol) client."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    async def connect(self):
        """Connect to MCP server."""
        raise NotImplementedError("MCPClient is not implemented in this SDK. Use ResearchClient for HTTP API access.")

    async def research(self, query: str, mode: str, session_id: str, output_schema: Dict) -> Dict:
        """Use MCP research tool."""
        raise NotImplementedError("MCPClient is not implemented in this SDK. Use ResearchClient for HTTP API access.")

    async def _call_tool(self, name: str, args: Dict) -> Dict:
        raise NotImplementedError("MCPClient is not implemented in this SDK. Use ResearchClient for HTTP API access.")


__all__ = [
    "ResearchClient",
    "MCPClient",
    "ResearchMode",
    "ResearchResult",
    "ResearchTimeoutError",
]
