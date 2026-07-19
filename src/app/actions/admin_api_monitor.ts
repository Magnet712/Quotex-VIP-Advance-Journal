'use server';

import { TwelveDataProvider } from '@/lib/market-data/forex/adapters/TwelveDataProvider';
import { createClient } from '@/lib/supabase/server';

// ── Auth Helpers ────────────────────────────────────────────────────────────────

async function verifyAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: adminRecord } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();
    return !!adminRecord;
  } catch {
    return false;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface RequestEntry {
  timestamp: string;
  endpoint: string;
  credits: number;
  latency: number;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'RATE_LIMITED';
}

export interface TwelveDataMonitorData {
  providerName: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  lastSuccessfulRequest: string | null;
  lastFailedRequest: string | null;
  lastResponseTime: number | null;
  creditsUsedToday: number;
  dailyLimit: number;
  creditsRemaining: number;
  usagePercent: number;
  totalRequestsToday: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  errors429: number;
  timeoutErrors: number;
  averageResponseTime: number;
  fastestResponse: number | null;
  slowestResponse: number | null;
  medianLatency: number;
  maskedApiKey: string;
  recentRequests: RequestEntry[];
  alerts: AlertInfo[];
  lastUpdated: string;
}

interface AlertInfo {
  level: 'green' | 'yellow' | 'orange' | 'red';
  label: string;
  description: string;
  active: boolean;
}

// ── Module-Level State (persists across server action calls within instance) ──

const MAX_HISTORY = 50;
const HEALTH_CHECK_COOLDOWN = 300_000; // 5 minutes between auto health checks

let requestHistory: RequestEntry[] = [];
let creditsLastKnown = 800;
const creditsLimit = 800;
let lastHealthCheckTime = 0;
let healthScore = 100;
let providerState = 'UNKNOWN';
let lastResponseTimeMs = 0;
let lastSuccessfulRequestTime: string | null = null;
let lastFailedRequestTime: string | null = null;
let totalRequestsTracked = 0;
let successCountTracked = 0;
let failureCountTracked = 0;
let error429Count = 0;
let timeoutCount = 0;
const performanceSamples: number[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 10) return 'N/A';
  return key.slice(0, 3) + 'x'.repeat(Math.min(key.length - 7, 24)) + key.slice(-4);
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Database Query ─────────────────────────────────────────────────────────────

async function getTelemetryData() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('provider_telemetry')
      .select('*')
      .eq('provider_id', 'twelvedata')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[AdminAPIMonitor] Telemetry query error:', error.message);
      return null;
    }
    return data?.[0] || null;
  } catch {
    return null;
  }
}

// ── Health Check ───────────────────────────────────────────────────────────────

async function runHealthCheck(): Promise<void> {
  const startTime = Date.now();
  lastHealthCheckTime = startTime;

  const entry: RequestEntry = {
    timestamp: new Date().toISOString(),
    endpoint: '/api_usage',
    credits: creditsLastKnown,
    latency: 0,
    status: 'SUCCESS',
  };

  let provider: TwelveDataProvider | null = null;

  try {
    provider = new TwelveDataProvider();
    await provider.connect();
    const isHealthy = await provider.checkHealth();

    const latency = Date.now() - startTime;
    entry.latency = latency;
    lastResponseTimeMs = latency;
    totalRequestsTracked++;

    performanceSamples.push(latency);
    if (performanceSamples.length > 200) {
      performanceSamples.shift();
    }

    if (isHealthy) {
      creditsLastKnown = provider.rateLimitRemaining;
      entry.credits = provider.rateLimitRemaining;
      entry.status = 'SUCCESS';
      lastSuccessfulRequestTime = new Date().toISOString();
      successCountTracked++;
      healthScore = Math.min(100, healthScore + 5);
      providerState = 'CONNECTED';
    } else {
      entry.status = 'FAILED';
      lastFailedRequestTime = new Date().toISOString();
      failureCountTracked++;
      healthScore = Math.max(0, healthScore - 10);
      providerState = provider.rateLimitRemaining <= 0 ? 'DEGRADED' : 'OFFLINE';
    }

    await provider.disconnect();
  } catch (err: unknown) {
    const latency = Date.now() - startTime;
    entry.latency = latency;
    entry.status = 'TIMEOUT';
    lastFailedRequestTime = new Date().toISOString();
    lastResponseTimeMs = latency;
    failureCountTracked++;
    timeoutCount++;
    healthScore = Math.max(0, healthScore - 15);
    providerState = 'OFFLINE';

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.includes('rate')) {
      entry.status = 'RATE_LIMITED';
      error429Count++;
    }
  }

  requestHistory.unshift(entry);
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory = requestHistory.slice(0, MAX_HISTORY);
  }
}

// ── Main Export ────────────────────────────────────────────────────────────────

export async function getTwelveDataMonitorData(
  forceRefresh = false
): Promise<TwelveDataMonitorData> {
  if (!(await verifyAdmin())) {
    throw new Error('Unauthorized. Admin access required.');
  }

  const telemetry = await getTelemetryData();

  // Merge telemetry state into module state for persistence
  if (telemetry) {
    if (telemetry.health_score !== null && telemetry.health_score !== undefined) {
      healthScore = telemetry.health_score;
    }
    if (telemetry.status) {
      providerState = telemetry.status;
    }
    if (telemetry.latency_ms) {
      lastResponseTimeMs = telemetry.latency_ms;
    }
  }

  // Run health check if forced or cooldown elapsed
  const now = Date.now();
  if (forceRefresh || now - lastHealthCheckTime > HEALTH_CHECK_COOLDOWN) {
    await runHealthCheck();
  }

  // ── Section 1: Provider Status ──────────────────────────────────────────────
  let derivedStatus: TwelveDataMonitorData['status'] = 'OFFLINE';
  if (providerState === 'CONNECTED') derivedStatus = 'ONLINE';
  else if (providerState === 'DEGRADED') derivedStatus = 'DEGRADED';

  // If telemetry shows connected but we haven't run health check yet
  if (telemetry && lastHealthCheckTime === 0) {
    if (telemetry.status === 'CONNECTED') derivedStatus = 'ONLINE';
    else if (telemetry.status === 'DEGRADED') derivedStatus = 'DEGRADED';
  }

  // ── Section 2: Credit Usage ─────────────────────────────────────────────────
  const dailyLimit = creditsLimit;
  const creditsUsed = Math.max(0, dailyLimit - creditsLastKnown);
  const usagePercent = dailyLimit > 0
    ? Math.round((creditsUsed / dailyLimit) * 1000) / 10
    : 0;

  // ── Section 3: Request Statistics ───────────────────────────────────────────
  const totalReq = totalRequestsTracked;
  const successReq = successCountTracked;
  const failedReq = failureCountTracked;
  const successRate = totalReq > 0
    ? Math.round((successReq / totalReq) * 1000) / 10
    : 100;

  // ── Section 4: Performance ──────────────────────────────────────────────────
  const samples = performanceSamples.length > 0 ? performanceSamples : [lastResponseTimeMs || 0];
  const avgResponse = samples.length > 0
    ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
    : 0;
  const fastestResponse = samples.length > 0 ? Math.min(...samples) : null;
  const slowestResponse = samples.length > 0 ? Math.max(...samples) : null;
  const medianLatency = computeMedian(samples);

  // ── Section 5: API Key ──────────────────────────────────────────────────────
  const maskedKey = maskApiKey(process.env.TWELVEDATA_API_KEY);

  // ── Section 6: Recent Requests ──────────────────────────────────────────────
  const recentReqs = [...requestHistory];

  // ── Section 7: Alerts ───────────────────────────────────────────────────────
  const alerts: AlertInfo[] = [
    {
      level: 'green',
      label: 'HEALTHY',
      description: 'API operating normally with sufficient credits.',
      active: usagePercent < 70,
    },
    {
      level: 'yellow',
      label: '70% USAGE',
      description: 'Credit usage has exceeded 70% of the daily limit.',
      active: usagePercent >= 70 && usagePercent < 85,
    },
    {
      level: 'orange',
      label: '85% USAGE',
      description: 'Credit usage has exceeded 85% of the daily limit.',
      active: usagePercent >= 85 && usagePercent < 95,
    },
    {
      level: 'red',
      label: '95% USAGE',
      description: 'Credit usage has exceeded 95% of the daily limit — near exhaustion.',
      active: usagePercent >= 95,
    },
  ];

  return {
    providerName: 'TwelveData',
    status: derivedStatus,
    lastSuccessfulRequest: lastSuccessfulRequestTime,
    lastFailedRequest: lastFailedRequestTime,
    lastResponseTime: lastResponseTimeMs > 0 ? lastResponseTimeMs : null,
    creditsUsedToday: creditsUsed,
    dailyLimit,
    creditsRemaining: creditsLastKnown,
    usagePercent,
    totalRequestsToday: totalReq,
    successfulRequests: successReq,
    failedRequests: failedReq,
    successRate,
    errors429: error429Count,
    timeoutErrors: timeoutCount,
    averageResponseTime: avgResponse,
    fastestResponse,
    slowestResponse,
    medianLatency,
    maskedApiKey: maskedKey,
    recentRequests: recentReqs,
    alerts,
    lastUpdated: new Date().toISOString(),
  };
}
