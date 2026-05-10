/**
 * Retry utilities with exponential backoff and circuit breaker pattern
 */

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: Error) => boolean;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
};

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxRetries) {
        throw lastError;
      }

      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, opts);
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms... Error: ${lastError.message}`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

const defaultCircuitOptions: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
};

/**
 * Circuit breaker class
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenCalls = 0;
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...defaultCircuitOptions, ...options };
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === 'open') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.transitionTo('half-open');
      } else {
        const error = new Error(`Circuit breaker is OPEN for ${context || 'operation'}`);
        error.name = 'CircuitBreakerOpenError';
        throw error;
      }
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
      const error = new Error(`Circuit breaker half-open limit reached for ${context || 'operation'}`);
      error.name = 'CircuitBreakerHalfOpenLimitError';
      throw error;
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo('closed');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    console.log(`[CircuitBreaker] Transitioning from ${this.state} to ${newState}`);
    this.state = newState;

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (newState === 'half-open') {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context?: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms for ${context || 'operation'}`));
      }, timeoutMs);
    }),
  ]);
}
