/**
 * Artifact Store
 * Stores full research output per task
 * 
 * Orchestrator only loads artifacts on demand
 * This keeps orchestrator context under 2,000 tokens regardless of depth
 */

import { prisma } from '../database/client.js';
import { Artifact } from '../types/index.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// S3 client for large artifact storage (optional)
const s3Client = process.env.S3_BUCKET
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    })
  : null;

const BUCKET_NAME = process.env.S3_BUCKET || '';

interface ArtifactCreateInput {
  artifactId: string;
  jobId: string;
  taskId: string;
  content: string;
  sources: Record<string, unknown>[];
  rawHtml?: string;
}

export class ArtifactStore {
  /**
   * Create artifact
   */
  async create(input: ArtifactCreateInput): Promise<void> {
    // Store in database
    await prisma.artifact.create({
      data: {
        artifactId: input.artifactId,
        jobId: input.jobId,
        taskId: input.taskId,
        content: input.content,
        sources: input.sources as any,
        rawHtml: input.rawHtml,
        extractedAt: new Date(),
      },
    });

    // If S3 is configured and content is large, also store there
    if (s3Client && input.rawHtml && input.rawHtml.length > 10000) {
      await this.storeInS3(input.artifactId, input.rawHtml);
    }
  }

  /**
   * Get artifact by ID
   */
  async get(artifactId: string): Promise<Artifact | null> {
    const artifact = await prisma.artifact.findUnique({
      where: { artifactId },
    });

    if (!artifact) return null;

    return {
      artifact_id: artifact.artifactId,
      job_id: artifact.jobId,
      task_id: artifact.taskId,
      content: artifact.content,
      sources: artifact.sources as any,
      raw_html: artifact.rawHtml || '',
      extracted_at: artifact.extractedAt.toISOString(),
    };
  }

  /**
   * Get artifact by job ID
   */
  async getByJobId(jobId: string): Promise<Artifact[]> {
    const artifacts = await prisma.artifact.findMany({
      where: { jobId },
      orderBy: { extractedAt: 'asc' },
    });

    return artifacts.map(a => ({
      artifact_id: a.artifactId,
      job_id: a.jobId,
      task_id: a.taskId,
      content: a.content,
      sources: a.sources as any,
      raw_html: a.rawHtml || '',
      extracted_at: a.extractedAt.toISOString(),
    }));
  }

  /**
   * Get artifact by task ID
   */
  async getByTaskId(taskId: string): Promise<Artifact | null> {
    const artifact = await prisma.artifact.findUnique({
      where: { taskId },
    });

    if (!artifact) return null;

    return {
      artifact_id: artifact.artifactId,
      job_id: artifact.jobId,
      task_id: artifact.taskId,
      content: artifact.content,
      sources: artifact.sources as any,
      raw_html: artifact.rawHtml || '',
      extracted_at: artifact.extractedAt.toISOString(),
    };
  }

  /**
   * Get compressed content only (for orchestrator)
   */
  async getCompressed(artifactId: string): Promise<string | null> {
    const artifact = await prisma.artifact.findUnique({
      where: { artifactId },
      select: { content: true },
    });

    return artifact?.content || null;
  }

  /**
   * Load full content on demand
   */
  async loadFullContent(artifactId: string): Promise<Artifact | null> {
    const artifact = await this.get(artifactId);
    
    if (!artifact) return null;

    // If stored in S3, fetch from there
    if (s3Client && artifact.raw_html.length === 0) {
      const s3Content = await this.loadFromS3(artifactId);
      if (s3Content) {
        artifact.raw_html = s3Content;
      }
    }

    return artifact;
  }

  /**
   * Check if artifact exists
   */
  async exists(artifactId: string): Promise<boolean> {
    const count = await prisma.artifact.count({
      where: { artifactId },
    });
    return count > 0;
  }

  /**
   * Delete artifact
   */
  async delete(artifactId: string): Promise<void> {
    await prisma.artifact.delete({
      where: { artifactId },
    });

    // Also delete from S3 if applicable
    if (s3Client) {
      await this.deleteFromS3(artifactId);
    }
  }

  /**
   * Cleanup artifacts for a job
   */
  async cleanupJob(jobId: string): Promise<void> {
    await prisma.artifact.deleteMany({
      where: { jobId },
    });
  }

  /**
   * Update artifact
   */
  async update(
    artifactId: string,
    updates: Partial<Pick<Artifact, 'content' | 'raw_html'>>
  ): Promise<void> {
    await prisma.artifact.update({
      where: { artifactId },
      data: {
        content: updates.content,
        rawHtml: updates.raw_html,
      },
    });
  }

  private async storeInS3(artifactId: string, content: string): Promise<void> {
    if (!s3Client) return;

    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `artifacts/${artifactId}.html`,
        Body: content,
        ContentType: 'text/html',
      });

      await s3Client.send(command);
    } catch (error) {
      console.error(`[ArtifactStore] Failed to store in S3: ${artifactId}`, error);
    }
  }

  private async loadFromS3(artifactId: string): Promise<string | null> {
    if (!s3Client) return null;

    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `artifacts/${artifactId}.html`,
      });

      const response = await s3Client.send(command);
      const content = await response.Body?.transformToString();
      return content || null;
    } catch (error) {
      console.error(`[ArtifactStore] Failed to load from S3: ${artifactId}`, error);
      return null;
    }
  }

  private async deleteFromS3(artifactId: string): Promise<void> {
    if (!s3Client) return;

    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `artifacts/${artifactId}.html`,
      });

      await s3Client.send(command);
    } catch (error) {
      console.error(`[ArtifactStore] Failed to delete from S3: ${artifactId}`, error);
    }
  }
}

export const artifactStore = new ArtifactStore();
