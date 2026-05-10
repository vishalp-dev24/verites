/**
 * Search Service
 * Integrates with search APIs (Tavily, Exa, custom)
 */

import axios from 'axios';

interface SearchResult {
  url: string;
  title: string;
  content: string;
  domain: string;
  published_date?: string;
}

interface SearchOptions {
  maxResults: number;
  timeRange?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
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
        console.warn('[Search] Tavily failed, falling back:', error);
      }
    }

    // Try Exa
    if (this.exaKey) {
      try {
        return await this.searchExa(query, options);
      } catch (error) {
        console.warn('[Search] Exa failed:', error);
      }
    }

    // Fallback: mock results for development
    return this.mockSearch(query, options);
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

  private mockSearch(query: string, options: SearchOptions): SearchResult[] {
    return [
      {
        url: 'https://example.com/result1',
        title: `Results for: ${query}`,
        content: 'Mock search result content for development',
        domain: 'example.com',
        published_date: new Date().toISOString(),
      },
    ];
  }
}

export const searchService = new SearchService();
