import { z } from 'zod';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_REGEX, 'Invalid UUID format');

export const pairSchema = z.string().min(1).max(20).transform(p => p.toUpperCase().trim());

export const directionSchema = z.enum(['CALL', 'PUT']);

export const timeframeSchema = z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

export const confidenceSchema = z.number().min(0).max(100);

export const priceSchema = z.number().positive('Price must be positive');

export const pageSchema = z.number().int().min(1).max(10000).default(1);

export const pageSizeSchema = z.number().int().min(1).max(1000).default(20);

export const sourceSchema = z.enum(['simulation', 'live_otc', 'live_market', 'manual']);

export const SaveSignalSchema = z.object({
  pair: pairSchema,
  timeframe: timeframeSchema,
  direction: directionSchema,
  entry_price: priceSchema,
  entry_time: z.date(),
  expiry_time: z.date(),
  strategy_name: z.string().min(1).max(100),
  confidence: confidenceSchema,
  risk_level: z.string().max(20).optional(),
  source: sourceSchema,
  strategy_version: z.string().max(20).optional(),
  quality_score: z.number().int().min(0).max(100).optional(),
  is_premium: z.boolean().optional(),
});

export const SaveCandleSchema = z.object({
  pair: pairSchema,
  timeframe: timeframeSchema,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  timestamp: z.date(),
  source: z.enum(['simulation', 'live_otc', 'manual']),
});

export const SignalHistoryFiltersSchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  pair: z.string().optional(),
  strategy: z.string().optional(),
  result: z.string().optional(),
  source: z.string().optional(),
  page: pageSchema.optional(),
  page_size: pageSizeSchema.optional(),
});

export function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('supabase') || msg.includes('database') || msg.includes('postgres') || 
        msg.includes('violates') || msg.includes('constraint') || msg.includes('foreign key') ||
        msg.includes('auth') && msg.includes('admin')) {
      return fallback;
    }
    return msg;
  }
  return fallback;
}
