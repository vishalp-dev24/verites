/**
 * Tavily Search Provider
 * 
 * Uses Tavily API for intelligent web search with AI-powered results
 */

import axios from 'axios';

// Config from environment
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  source: string;
  confidence: number;
}

export class TavilySearchService {
  private apiKey: string;
  
  constructor() {
    this.apiKey = TAVILY_API_KEY;
  }

  async search(query: string, options?: {
    topic?: 'general' | 'news' | 'finance' | 'law';
    maxResults?: number;
    days?: number;
  }): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error('Tavily API key not configured');
    }

    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        query,
        api_key: this.apiKey,
        search_depth: 'advanced',
        include_answer: true,
        include_images: false,
        topic: options?.topic || 'general',
        max_results: options?.maxResults || 10,
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
      title: result.title || '',
      url: result.url || '',
      content: result.content || result.snippet || '',
      source: this.extractDomain(result.url || ''),
      confidence: result.score || 0.7,
    }));
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }
}
