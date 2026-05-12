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
    description:
      "Run trusted multi-source web research. Use this when an agent needs current facts, source checks, or structured research output.",
    schema: z.object({
      query: z.string().describe("Research question to investigate."),
      mode: z.enum(["lite", "medium", "deep"]).default("medium"),
      sessionId: z.string().optional().describe("Stable session id for follow-up research."),
    }),
  }
);
