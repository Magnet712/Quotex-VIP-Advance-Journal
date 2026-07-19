import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import os from "os";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ status: "UP" });
  }

  const { data: adminRecord } = await supabase
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!adminRecord) {
    return NextResponse.json({ status: "UP" });
  }

  const adminSupabase = createAdminClient();

  let dbStatus = "CONNECTED";
  let telemetry: any[] = [];
  let flags: any[] = [];

  try {
    const { data: dbCheck, error: dbError } = await adminSupabase
      .from("system_settings")
      .select("key, value")
      .like("key", "feature_flag_%");

    if (dbError) {
      dbStatus = "DISCONNECTED";
    } else {
      flags = (dbCheck || []).map(item => ({
        key: item.key.replace("feature_flag_", ""),
        value: item.value
      }));
    }

    const { data: telemetryCheck } = await adminSupabase
      .from("provider_telemetry")
      .select("*");

    telemetry = telemetryCheck || [];
  } catch (e) {
    dbStatus = "DISCONNECTED";
  }

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
    status: dbStatus === "CONNECTED" ? "UP" : "DEGRADED",
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
