/**
 * Search Service
 * Integrates with search APIs (Tavily, Exa, custom)
 */

import axios from 'axios';

export interface SearchResult {
  url: string;
  title: string;
  content: string;
  domain: string;
  published_date?: string;
}

export interface SearchOptions {
  maxResults: number;
  timeRange?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

function sanitizeProviderError(provider: string, error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    return {
      provider,
      status: error.response?.status,
      code: error.code,
      message: error.message,
    };
  }

  return {
    provider,
    message: error instanceof Error ? error.message : String(error),
  };
}

export class SearchService {
  private tavilyKey: string;
  private exaKey: string;

  constructor() {
    this.tavilyKey = process.env.TAVILY_API_KEY || '';
    this.exaKey = process.env.EXA_API_KEY || '';
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Try Tavily first
    if (this.tavilyKey) {
      try {
        return await this.searchTavily(query, options);
      } catch (error) {
        console.warn('[Search] Tavily failed, falling back:', sanitizeProviderError('tavily', error));
      }
    }

    // Try Exa
    if (this.exaKey) {
      try {
        return await this.searchExa(query, options);
      } catch (error) {
        console.warn('[Search] Exa failed:', sanitizeProviderError('exa', error));
      }
    }

    throw new Error('No search provider configured. Set TAVILY_API_KEY or EXA_API_KEY.');
  }

  private async searchTavily(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        query,
        search_depth: 'comprehensive',
        include_answer: false,
        max_results: options.maxResults,
        include_domains: options.includeDomains,
        exclude_domains: options.excludeDomains,
      },
      {
        headers: { 'X-API-Key': this.tavilyKey },
      }
    );

    return response.data.results.map((r: any) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      domain: new URL(r.url).hostname,
      published_date: r.published_date,
    }));
  }

  private async searchExa(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const response = await axios.post(
      'https://api.exa.ai/search',
      {
        query,
        num_results: options.maxResults,
        include_domains: options.includeDomains,
        exclude_domains: options.excludeDomains,
      },
      {
        headers: { 'X-API-Key': this.exaKey },
      }
    );

    return response.data.results.map((r: any) => ({
      url: r.url,
      title: r.title,
      content: r.text,
      domain: new URL(r.url).hostname,
      published_date: r.published_date,
    }));
  }

}

export const searchService = new SearchService();
