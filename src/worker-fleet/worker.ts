/**
 * Worker Fleet
 * Parallel research workers with durable checkpointing
 *
 * Each worker:
 * 1. Reads assigned task
 * 2. Checks Blackboard to avoid duplication
 * 3. Fetches pages through behavior-aware proxy
 * 4. Passes content through extraction pipeline
 * 5. Runs trust scorer
 * 6. Writes to Blackboard and Artifact Store
 * 7. Checkpoints after every source
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { Task, Source, Checkpoint, Artifact, BlackboardEntry, ResearchMode } from '../types/index.js';

interface WorkerConfig {
  task: Task;
  tenantId: string;
  jobId: string;
  sessionId: string;
  proxyPool: ProxyIdentity[];
}

interface ProxyIdentity {
  ip: string;
  userAgent: string;
  timezone: string;
  fingerprint: string;
}

export class ResearchWorker {
  private task: Task;
  private tenantId: string;
  private jobId: string;
  private sessionId: string;
  private currentProxy: ProxyIdentity | null = null;
  private browser: puppeteer.Browser | null = null;
  private sourcesFetched: Source[] = [];
  private checkpoint: Checkpoint | null = null;

  constructor(config: WorkerConfig) {
    this.task = config.task;
    this.tenantId = config.tenantId;
    this.jobId = config.jobId;
    this.sessionId = config.sessionId;
  }

  async execute(): Promise<{ sources: Source[]; artifactId: string }> {
    console.log(`[Worker ${this.task.task_id}] Starting research on: ${this.task.topic}`);

    try {
      // Check if resuming from checkpoint
      if (this.task.checkpoint) {
        await this.resumeFromCheckpoint(this.task.checkpoint);
      }

      // Initialize browser with rotating proxy
      await this.initializeBrowser();

      // Perform research
      const sources = await this.researchTopic();

      // Create artifact
      const artifactId = await this.createArtifact(sources);

      console.log(`[Worker ${this.task.task_id}] Completed with ${sources.length} sources`);

      return { sources, artifactId };
    } catch (error) {
      console.error(`[Worker ${this.task.task_id}] Error:`, error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async initializeBrowser(): Promise<void> {
    // Get new proxy identity
    this.currentProxy = await this.getProxyIdentity();

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--proxy-server=${this.currentProxy.ip}`,
      ],
    });
  }

  private async getProxyIdentity(): Promise<ProxyIdentity> {
    // TODO: Implement actual proxy rotation service
    return {
      ip: 'http://proxy.example.com:8080',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      timezone: 'America/New_York',
      fingerprint: `fp_${Date.now()}`,
    };
  }

  private async researchTopic(): Promise<Source[]> {
    const targetSources = this.getTargetSourceCount();
    const searchResults = await this.performSearch(this.task.topic || this.task.query || '', targetSources * 2);

    for (const result of searchResults) {
      try {
        // Check if should skip (already fetched or domain throttled)
        if (await this.shouldSkipDomain(result.domain)) {
          continue;
        }

        // Fetch page
        const page = await this.browser!.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(this.currentProxy!.userAgent);

        await page.goto(result.url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract content
        const html = await page.content();
        const extracted = await this.extractContent(html, result.url);

        // Pass through security pipeline
        const securityResult = await this.runSecurityCheck(extracted);
        if (!securityResult.safe) {
          console.log(`[Worker ${this.task.task_id}] Skipped ${result.url} - security flag`);
          await page.close();
          continue;
        }

        // Score trust
        const trustScore = await this.calculateTrustScore(extracted);

        const source: Source = {
          url: result.url,
          title: extracted.title,
          trust_score: trustScore,
          type: this.classifySourceType(result.domain),
          publish_date: extracted.publishDate || new Date().toISOString(),
          content_excerpt: extracted.body_text.substring(0, 500),
        };

        this.sourcesFetched.push(source);

        // Write to Blackboard
        await this.updateBlackboard(source);

        // Checkpoint
        await this.createCheckpoint();

        await page.close();

        // Check if we have enough sources
        if (this.sourcesFetched.length >= targetSources) {
          break;
        }
      } catch (error) {
        console.error(`[Worker ${this.task.task_id}] Failed to fetch ${result.url}:`, error);
        // Rotate proxy on failure
        await this.rotateProxy();
      }
    }

    return this.sourcesFetched;
  }

  private getTargetSourceCount(): number {
    const mode = this.task.mode as ResearchMode;
    const byMode: Record<ResearchMode, number> = {
      lite: 4,
      medium: 12,
      deep: 35,
    };
    return byMode[mode] ?? byMode.medium;
  }

  private async performSearch(query: string, maxResults: number): Promise<{ url: string; domain: string }[]> {
    // TODO: Integrate with search API (Tavily, Exa, or SERP)
    // For now, return mock results
    console.log(`[Worker ${this.task.task_id}] Searching for: ${query}`);

    return [
      { url: 'https://example.com/article1', domain: 'example.com' },
      { url: 'https://example.org/article2', domain: 'example.org' },
    ];
  }

  private async shouldSkipDomain(domain: string): Promise<boolean> {
    // Check Blackboard for domain access
    // TODO: Implement domain throttling via Blackboard
    return false;
  }

  private async extractContent(html: string, url: string): Promise<{
    title: string;
    publishDate: string;
    author: string;
    body_text: string;
    domain: string;
  }> {
    const $ = cheerio.load(html);

    // Remove scripts and styles
    $('script, style, nav, footer, header, aside').remove();

    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    const body_text = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);

    // Try to extract publish date
    const publishDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('time').first().attr('datetime') ||
      new Date().toISOString();

    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      'Unknown';

    const urlObj = new URL(url);

    return {
      title: title.substring(0, 200),
      publishDate,
      author: author.substring(0, 100),
      body_text,
      domain: urlObj.hostname,
    };
  }

  private async runSecurityCheck(extracted: {
    title: string;
    body_text: string;
  }): Promise<{ safe: boolean; risk_score: number }> {
    // Layer 1: Already extracted, no raw HTML
    // Layer 2: Intent classifier
    const suspiciousPatterns = [
      /ignore previous instructions/i,
      /disregard (?:all|your) instructions/i,
      /you are (?:now|no longer)/i,
      /act as (?:if|though)/i,
      /new (?:persona|role|character)/i,
      /system prompt/i,
      /prompt injection/i,
    ];

    const combinedText = `${extracted.title} ${extracted.body_text}`.toLowerCase();
    const riskScore = suspiciousPatterns.reduce((score, pattern) => {
      return score + (pattern.test(combinedText) ? 0.3 : 0);
    }, 0);

    return {
      safe: riskScore < 0.7,
      risk_score: Math.min(riskScore, 1.0),
    };
  }

  private async calculateTrustScore(extracted: {
    domain: string;
    publishDate: string;
  }): Promise<number> {
    // Simplified trust scoring
    const domainAuthority = this.scoreDomainAuthority(extracted.domain);
    const freshness = this.scoreFreshness(extracted.publishDate);

    return (domainAuthority * 0.5 + freshness * 0.5);
  }

  private scoreDomainAuthority(domain: string): number {
    const trustedDomains = ['.gov', '.edu', '.org', 'wikipedia.org', 'github.com'];
    const hasTrusted = trustedDomains.some(td => domain.includes(td));
    return hasTrusted ? 0.8 : 0.5;
  }

  private scoreFreshness(publishDate: string): number {
    const daysSince = Math.floor(
      (Date.now() - new Date(publishDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < 7) return 1.0;
    if (daysSince < 30) return 0.8;
    if (daysSince < 365) return 0.6;
    return 0.4;
  }

  private classifySourceType(domain: string): 'primary' | 'secondary' {
    const primaryIndicators = ['.gov', '.edu', 'arxiv.org', 'doi.org', 'research'];
    return primaryIndicators.some(pi => domain.includes(pi)) ? 'primary' : 'secondary';
  }

  private async updateBlackboard(source: Source): Promise<void> {
    // TODO: Write to Blackboard
    console.log(`[Worker ${this.task.task_id}] Updated Blackboard with: ${source.url}`);
  }

  private async createCheckpoint(): Promise<void> {
    this.checkpoint = {
      last_source_index: this.sourcesFetched.length - 1,
      sources_fetched: this.sourcesFetched.map(s => s.url),
      compressed_summary: this.compressSources(this.sourcesFetched),
      artifact_id: `art_${this.task.task_id}`,
    };

    // TODO: Persist checkpoint to store
    console.log(`[Worker ${this.task.task_id}] Checkpoint created at source ${this.sourcesFetched.length}`);
  }

  private async resumeFromCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoint = checkpoint;
    console.log(`[Worker ${this.task.task_id}] Resuming from checkpoint: ${checkpoint.last_source_index} sources`);
  }

  private compressSources(sources: Source[]): string {
    // Create compressed summary for Blackboard
    return sources.map(s => `${s.title}: ${s.content_excerpt.substring(0, 100)}...`).join(' | ');
  }

  private async createArtifact(sources: Source[]): Promise<string> {
    const artifactId = `art_${this.task.task_id}_${Date.now()}`;

    const artifact: Artifact = {
      artifact_id: artifactId,
      job_id: this.jobId,
      task_id: this.task.task_id,
      content: this.compressSources(sources),
      sources,
      raw_html: '', // Would contain full raw HTML
      extracted_at: new Date().toISOString(),
    };

    // TODO: Persist artifact to Artifact Store
    console.log(`[Worker ${this.task.task_id}] Created artifact: ${artifactId}`);

    return artifactId;
  }

  private async rotateProxy(): Promise<void> {
    this.currentProxy = await this.getProxyIdentity();
    console.log(`[Worker ${this.task.task_id}] Rotated proxy`);
  }

  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export async function createWorker(config: WorkerConfig): Promise<ResearchWorker> {
  return new ResearchWorker(config);
}
