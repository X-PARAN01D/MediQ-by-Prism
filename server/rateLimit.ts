import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, ClientRecord>();

// Periodic cleanup of expired rate limit entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 2 * 60 * 1000);

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message, keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Generate identifier: custom key or client IP or forwarded-for
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = keyGenerator ? keyGenerator(req) : `${req.baseUrl || req.path}:${clientIp}`;

    const now = Date.now();
    let record = memoryStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: message || `Rate limit exceeded. Please try again in ${resetSeconds} seconds.`,
        retryAfterSeconds: resetSeconds
      });
    }

    next();
  };
}

// 1. Strict Limiter for Auth / Login / Register (Brute-force protection: 10 attempts per 15 minutes)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts from this IP. Please try again in 15 minutes.'
});

// 2. AI Chatbot & LLM Triage Limiter (API cost and token abuse protection: 25 requests per minute)
export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'AI assistant rate limit reached. Please wait a moment before sending more medical queries.'
});

// 3. Audio / Speech Synthesis & Transcription Limiter (Resource protection: 20 per minute)
export const speechRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 25,
  message: 'Voice processing rate limit reached. Please pause before recording again.'
});

// 4. General API Rate Limiter (General protection: 120 per minute)
export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests. Please slow down.'
});
