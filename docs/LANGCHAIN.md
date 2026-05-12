# LangChain Integration

LangChain supports custom tools. Veritas fits that model: it is a research API that an agent can call when a task needs current, multi-source research.

Use Veritas as a tool when the agent needs to:

- gather current information from the web;
- cross-check sources before answering;
- keep research context across a session;
- return structured JSON instead of raw search snippets.

## JavaScript

Install LangChain in the consuming agent project. Inside this monorepo, `@veritas/sdk` is available as the JavaScript workspace package. Once published, it can be installed from npm.

```bash
npm install langchain zod
```

Create a tool:

```ts
import { tool } from "langchain";
import * as z from "zod";
import { ResearchClient } from "@veritas/sdk";

const client = new ResearchClient({
  apiKey: process.env.VERITAS_API_KEY!,
  baseUrl: process.env.VERITAS_API_URL || "http://localhost:3000/v1",
});

export const veritasResearchTool = tool(
  async ({ query, mode, sessionId }) => {
    const result = await client.research({
      query,
      mode,
      sessionId: sessionId || "langchain-default",
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_findings: { type: "array", items: { type: "string" } },
          sources: { type: "array" },
        },
      },
    });

    return JSON.stringify({
      status: result.status,
      confidence_score: result.confidenceScore,
      data: result.data,
      sources: result.sources,
      error: result.error,
    });
  },
  {
    name: "veritas_research",
    description: "Run trusted multi-source web research. Use this when an agent needs current facts, source checks, or structured research output.",
    schema: z.object({
      query: z.string().describe("Research question to investigate."),
      mode: z.enum(["lite", "medium", "deep"]).default("medium"),
      sessionId: z.string().optional().describe("Stable session id for follow-up research."),
    }),
  }
);
```

Then pass `veritasResearchTool` into your LangChain agent's `tools` array.

## Python

Install LangChain in the consuming agent project. Until the Python SDK is published, install it from this repository.

```bash
pip install langchain
pip install "git+https://github.com/vishalp-dev24/verites.git#subdirectory=sdk/python"
```

Create a tool:

```python
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

    return json.dumps({
        "status": result.status,
        "confidence_score": result.confidence_score,
        "data": result.data,
        "sources": result.sources,
        "error": result.error,
    })
```

Then pass `veritas_research` into your LangChain agent's tool list.

## Positioning

Do not pitch Veritas as another chatbot or dashboard. Pitch it as a research tool for agent builders:

> Veritas is an MCP and API research backend that agent developers can add as a tool when their agents need current, source-checked research.
