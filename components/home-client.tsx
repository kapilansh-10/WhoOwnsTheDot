"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dollars, relativeTime } from "@/lib/format";
import type { DotHistory, DotState } from "@/lib/types";

type PendingCheckout = {
  checkoutSessionId: string;
  expectedAmountCents: number;
};

type Stats = {
  total_raised_cents: number;
  owner_count: number;
};

const pendingKey = "whoownsthedot.pendingCheckout";

function safeExternalUrl(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function readPendingCheckout(): PendingCheckout | null {
  try {
    const raw = window.localStorage.getItem(pendingKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCheckout;
    if (!parsed.checkoutSessionId || !Number.isInteger(parsed.expectedAmountCents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function HomeClient({
  initialState,
  initialHistory,
  initialStats,
}: {
  initialState: DotState;
  initialHistory: DotHistory[];
  initialStats: Stats;
}) {
  const [state, setState] = useState(initialState);
  const [history, setHistory] = useState(initialHistory);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owned, setOwned] = useState(false);
  const [lost, setLost] = useState(false);
  const [confirming, setConfirming] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("owned") === "1";
  });
  const [totalRaised, setTotalRaised] = useState(initialStats.total_raised_cents);
  const [ownerCount, setOwnerCount] = useState(initialStats.owner_count);
  const [watching, setWatching] = useState(0);
  const [visitorsSinceLaunch, setVisitorsSinceLaunch] = useState(0);
  const [seenHistoryIds, setSeenHistoryIds] = useState<Set<string>>(
    () => new Set(initialHistory.map((item) => item.id))
  );

  const nextPrice = state.amount_cents + 100;
  const newestHistoryId = history[0]?.id;
  const isNewestFresh = !!newestHistoryId && !seenHistoryIds.has(newestHistoryId);

  useEffect(() => {
    function applyResult(nextState: DotState) {
      const pending = readPendingCheckout();
      if (!pending) return;

      if (nextState.dodo_checkout_session_id === pending.checkoutSessionId) {
        setOwned(true);
        setLost(false);
        setConfirming(false);
        window.localStorage.removeItem(pendingKey);
      } else if (nextState.amount_cents >= pending.expectedAmountCents && nextState.dodo_checkout_session_id) {
        setOwned(false);
        setLost(true);
        setConfirming(false);
        window.localStorage.removeItem(pendingKey);
      } else {
        setConfirming(new URLSearchParams(window.location.search).get("owned") === "1");
      }
    }

    const refresh = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json();
        setState((previous: DotState) => (next.state.amount_cents !== previous.amount_cents ? next.state : previous));
        setHistory(next.history);
        setTotalRaised(next.stats.total_raised_cents);
        setOwnerCount(next.stats.owner_count);
        setSeenHistoryIds(new Set(next.history.map((item: DotHistory) => item.id)));
        applyResult(next.state);
      } catch {}
    };
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const heartbeat = async () => {
      try {
        const response = await fetch("/api/heartbeat", { method: "POST", cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as { watching?: number; visitors_since_launch?: number };
        if (typeof next.watching === "number") setWatching(next.watching);
        if (typeof next.visitors_since_launch === "number") setVisitorsSinceLaunch(next.visitors_since_launch);
      } catch {}
    };
    heartbeat();
    const id = window.setInterval(heartbeat, 15000);
    return () => window.clearInterval(id);
  }, []);

  async function checkout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not start checkout.");
      window.localStorage.setItem(pendingKey, JSON.stringify({
        checkoutSessionId: payload.checkout_session_id,
        expectedAmountCents: payload.expected_amount_cents,
      }));
      window.location.assign(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  function openCheckout() {
    setName(""); setUrl(""); setError(""); setOpen(true);
  }

  const ownerHref = safeExternalUrl(state.owner_url);

  return (
    <main className="min-h-screen px-5 pt-5 pb-10 md:px-8 md:pt-7 md:pb-12">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between text-[11px] uppercase tracking-[0.14em] text-neutral-500">
        <span className="text-black">WhoOwnsTheDot</span>
        <div className="flex items-center gap-5">
          <Link href="/history" className="hidden text-neutral-500 transition-colors hover:text-black sm:inline">history</Link>
          <span className="tabular-nums text-neutral-500">{dollars(totalRaised)} raised</span>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center py-12 text-center md:py-16">
        <DotFrame key={state.owner_name} />

        <div className="mt-10 flex flex-col items-center md:mt-12">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500">
            Owned by
          </div>
          <div key={state.owner_name} className="owner-changed mt-4 text-xl font-medium tracking-tight md:text-2xl">
            {ownerHref ? (
              <a className="underline-offset-[6px] transition-colors hover:underline" href={ownerHref} target="_blank" rel="noreferrer">
                {state.owner_name}
              </a>
            ) : (
              state.owner_name
            )}
          </div>

          <div key={state.amount_cents} className="number-changed mt-7 text-6xl font-semibold tracking-[-0.04em] tabular-nums md:text-7xl">
            {dollars(state.amount_cents)}
          </div>

          <button
            type="button"
            onClick={openCheckout}
            className="group mt-9 inline-flex items-center justify-center border border-black bg-black px-7 py-3.5 text-sm font-medium tracking-tight text-white transition-all duration-200 ease-out hover:-translate-y-px hover:bg-white hover:text-black active:translate-y-0 active:scale-[0.99] disabled:opacity-50"
          >
            Own it for {dollars(nextPrice)}
          </button>

          <p className="mt-5 text-[11px] tracking-wide text-neutral-500">
            No refunds <span className="mx-1.5 text-neutral-300">·</span> +$1 to take it
          </p>

          {owned && <p className="mt-6 text-sm text-green-700">You own the dot.</p>}
          {lost && !owned && <p className="mt-6 text-sm text-red-600">Too slow. Someone else took the dot.</p>}
          {confirming && !owned && !lost && <p className="mt-6 text-sm text-neutral-500">Payment received. Confirming ownership…</p>}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl border-t border-black/10 pt-6 pb-12">
        <div className="mb-10 grid grid-cols-2 gap-y-3 text-xs sm:flex sm:flex-nowrap sm:items-stretch sm:justify-center sm:gap-y-0">
          <StatCell label="Paid" animatedKey={totalRaised}>
            <span className="font-semibold tabular-nums">{dollars(totalRaised)}</span>
          </StatCell>
          <StatCell label="Owners" animatedKey={ownerCount}>
            <span className="font-semibold tabular-nums">{ownerCount.toLocaleString()}</span>
          </StatCell>
          <StatCell label="Watching" tone="watching" animatedKey={watching}>
            <span className="flex items-center gap-2">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-semibold tabular-nums text-emerald-600">{watching.toLocaleString()}</span>
            </span>
          </StatCell>
          <StatCell label="Visitors" animatedKey={visitorsSinceLaunch}>
            <span className="font-semibold tabular-nums">{visitorsSinceLaunch.toLocaleString()}</span>
          </StatCell>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500">
              Recent owners
            </h2>
            <Link href="/history" className="text-[10px] uppercase tracking-[0.22em] text-neutral-400 transition-colors hover:text-black">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
            {history.map((item) => {
              const itemHref = safeExternalUrl(item.owner_url);
              const isNew = item.id === newestHistoryId && isNewestFresh;
              return (
                <li
                  key={item.id}
                  className={`flex items-center justify-between gap-4 py-3.5 text-sm ${isNew ? "row-new" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums tracking-tight text-black">
                      {dollars(item.amount_cents)}
                    </span>
                    <span className="truncate text-neutral-700">
                      {itemHref ? (
                        <a className="underline-offset-[5px] transition-colors hover:underline" href={itemHref} target="_blank" rel="noreferrer">
                          {item.owner_name}
                        </a>
                      ) : (
                        item.owner_name
                      )}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
                    {relativeTime(item.created_at)}
                  </span>
                </li>
              );
            })}
            {history.length === 0 && (
              <li className="py-6 text-sm text-neutral-400">Nobody has bought the dot yet.</li>
            )}
          </ul>
        </div>

        <div className="mx-auto mt-14 max-w-2xl">
          <details className="group text-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 transition-colors hover:text-black">
              <span>FAQ</span>
              <span className="text-neutral-400 transition-transform duration-300 group-open:rotate-45">+</span>
            </summary>
            <div className="mt-6 space-y-5 text-[13px] leading-6 text-neutral-600">
              <div>
                <p className="text-black">Is this real?</p>
                <p className="mt-1 text-neutral-600">Yes. You pay, you own the dot, until someone pays $1 more.</p>
              </div>
              <div>
                <p className="text-black">What do I get?</p>
                <p className="mt-1 text-neutral-600">Your name under the dot and a place in history. That is the product.</p>
              </div>
              <div>
                <p className="text-black">Refunds?</p>
                <p className="mt-1 text-neutral-600">No.</p>
              </div>
              <div>
                <p className="text-black">Why?</p>
                <p className="mt-1 text-neutral-600">Because it is funny.</p>
              </div>
            </div>
          </details>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-5" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="w-full max-w-sm border border-black bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="checkout-title" className="text-xl font-semibold tracking-tight">Own the dot</h2><p className="mt-1 text-xs text-neutral-500">You will pay {dollars(nextPrice)}.</p></div>
              <button className="text-xl leading-none" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <label className="mt-6 block text-xs font-medium">Display name</label>
            <input autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full border border-black px-3 py-3 outline-none focus:ring-1 focus:ring-black" placeholder="alice" />
            <label className="mt-4 block text-xs font-medium">Optional link</label>
            <input maxLength={300} value={url} onChange={(e) => setUrl(e.target.value)} className="mt-2 w-full border border-black px-3 py-3 outline-none focus:ring-1 focus:ring-black" placeholder="@alice or https://…" />
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <button disabled={busy || name.trim().length < 2} onClick={checkout} className="mt-6 w-full bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Opening checkout…" : `Pay ${dollars(nextPrice)}`}</button>
            <p className="mt-3 text-[10px] leading-4 text-neutral-400">No refunds. Your ownership is public.</p>
          </div>
        </div>
      )}
    </main>
  );
}

function DotFrame() {
  return <div className="dot dot-owner-changed" aria-label="The dot" />;
}

function StatCell({
  label,
  children,
  tone = "default",
  animatedKey,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "default" | "watching";
  animatedKey: string | number;
}) {
  const labelColor = tone === "watching" ? "text-emerald-600" : "text-neutral-500";
  return (
    <div className="flex flex-1 items-center justify-center gap-2 px-3 sm:border-r sm:border-black/10 sm:last:border-r-0">
      <span className={`text-[11px] uppercase tracking-[0.18em] ${labelColor}`}>{label}</span>
      <span key={String(animatedKey)} className="number-changed">{children}</span>
    </div>
  );
}