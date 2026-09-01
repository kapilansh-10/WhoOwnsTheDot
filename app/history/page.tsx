import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase";
import { dollars, relativeTime } from "@/lib/format";
import type { DotHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { data, error } = await getSupabaseServer().from("dot_history").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const history = (data ?? []) as DotHistory[];
  return (
    <main className="min-h-screen px-5 py-5 md:px-8">
      <div className="flex items-center justify-between text-xs"><Link href="/" className="underline underline-offset-4">← the dot</Link><span>history</span></div>
      <div className="mx-auto max-w-2xl py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Everyone who owned the dot</h1>
        <div className="mt-10 divide-y divide-black/10 border-y border-black/10">
          {history.map((item) => <div key={item.id} className="flex justify-between gap-4 py-4 text-sm"><span>{dollars(item.amount_cents)} · {item.owner_url ? <a className="underline" href={item.owner_url} target="_blank" rel="noreferrer">{item.owner_name}</a> : item.owner_name}</span><span className="text-neutral-400">{relativeTime(item.created_at)}</span></div>)}
          {!history.length && <p className="py-6 text-sm text-neutral-500">No owners yet.</p>}
        </div>
      </div>
    </main>
  );
}
