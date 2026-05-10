
/**
 * Tavily Search Integration
 * Production-ready search with API key rotation
 */

import axios from 'axios';
import { searchConfig } from '../config/search.js';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score: number;
}

export class TavilySearchService {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('TAVILY_API_KEY not set, search will fail');
    }
  }

  async search(
    query: string,
    options: {
      search_depth?: 'basic' | 'advanced';
      max_results?: number;
      include_answer?: boolean;
      include_images?: boolean;
      include_raw_content?: boolean;
      days?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const response = await axios.post(
      `${this.baseUrl}/search`,
      {
        query,
        api_key: this.apiKey,
        search_depth: options.search_depth || 'advanced',
        max_results: options.max_results || 10,
        include_answer: options.include_answer ?? false,
        include_images: options.include_images ?? false,
        include_raw_content: options.include_raw_content ?? true,
        days: options.days,
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid Tavily response format');
    }

    return data.results.map((result: any) => ({
      title: result.title || 'Untitled',
      url: result.url,
      content: result.content || result.raw_content || '',
      published_date: result.published_date,
      score: result.score || 0,
    }));
  }

  async batchSearch(
    queries: string[],
    options: { max_results?: number } = {}
  ): Promise<SearchResult[][]> {
    const results = await Promise.all(
      queries.map(q => this.search(q, { max_results: options.max_results }).catch(err => {
        console.error(`Search failed for "${q}":`, err.message);
        return [];
      }))
    );
    return results;
  }
}

export const tavilySearch = new TavilySearchService();
