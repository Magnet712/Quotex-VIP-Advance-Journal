import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import os from "os";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceRole);
  
  let dbStatus = "CONNECTED";
  let telemetry: any[] = [];
  let flags: any[] = [];

  try {
    // 1. Check Database connection & pull feature flags
    const { data: dbCheck, error: dbError } = await supabase
      .from("feature_flags")
      .select("*");
    
    if (dbError) {
      dbStatus = "DISCONNECTED";
    } else {
      flags = dbCheck || [];
    }

    // 2. Fetch telemetry stats
    const { data: telemetryCheck } = await supabase
      .from("provider_telemetry")
      .select("*");
    
    telemetry = telemetryCheck || [];
  } catch (e) {
    dbStatus = "DISCONNECTED";
  }

  // Worker is evaluated as active if any telemetry row has updated in the last 45s
  let workerStatus = "INACTIVE";
  if (telemetry.length > 0) {
    const lastUpdate = Math.max(...telemetry.map(t => new Date(t.last_update).getTime()));
    if (Date.now() - lastUpdate < 45000) {
      workerStatus = "ACTIVE";
    }
  }

  const freeMem = os.freemem() / (1024 * 1024);
  const totalMem = os.totalmem() / (1024 * 1024);

  return NextResponse.json({
    status: dbStatus === "CONNECTED" && workerStatus === "ACTIVE" ? "UP" : "DEGRADED",
    version: {
      marketDataLayer: "1.2.0",
      worker: "2.0.0",
      strategy: "2.3.1"
    },
    database: dbStatus,
    worker: workerStatus,
    featureFlags: flags.reduce((acc, f) => ({ ...acc, [f.key]: f.value === "true" }), {}),
    system: {
      memoryUsedMB: parseFloat((totalMem - freeMem).toFixed(2)),
      memoryTotalMB: parseFloat(totalMem.toFixed(2)),
      cpuLoad: os.loadavg()
    },
    telemetry: telemetry.map(t => ({
      provider: t.provider_id,
      state: t.status,
      active: t.active_flag,
      health: t.health_score,
      latency: t.latency_ms,
      lastUpdate: t.last_update
    }))
  });
}
