import { getSupabaseServer } from "@/lib/supabase";
import { DotState, DotHistory } from "@/lib/types";
import { HomeClient } from "@/components/home-client";

export const dynamic = "force-dynamic";

async function getData() {
  const supabase = getSupabaseServer();
  const [{ data: state, error: stateError }, { data: history, error: historyError }, { data: stats, error: statsError }] = await Promise.all([
    supabase.from("dot_state").select("*").order("updated_at", { ascending: false }).limit(1).single(),
    supabase.from("dot_history").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.rpc("dot_stats"),
  ]);
  if (stateError) throw new Error(stateError.message);
  if (historyError) throw new Error(historyError.message);
  if (statsError) throw new Error(statsError.message);
  return { state: state as DotState, history: (history ?? []) as DotHistory[], stats: stats as { total_raised_cents: number; owner_count: number } };
}

export default async function Home() {
  const data = await getData();
  return <HomeClient initialState={data.state} initialHistory={data.history} initialStats={data.stats} />;
}
