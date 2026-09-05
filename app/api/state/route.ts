import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServer();
  const [{ data: state, error: stateError }, { data: history, error: historyError }, { data: stats, error: statsError }] = await Promise.all([
    supabase.from("dot_state").select("*").order("updated_at", { ascending: false }).limit(1).single(),
    supabase.from("dot_history").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.rpc("dot_stats"),
  ]);
  if (stateError || historyError || statsError) return NextResponse.json({ error: "Could not load state." }, { status: 500 });
  return NextResponse.json(
    {
      state,
      current_owner: state.owner_name,
      owner_url: state.owner_url,
      current_amount_cents: state.amount_cents,
      next_price_cents: state.amount_cents + 100,
      total_raised_cents: stats.total_raised_cents,
      owner_count: stats.owner_count,
      history,
      stats,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
