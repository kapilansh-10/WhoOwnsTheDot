"use client";

import { useEffect, useState } from "react";
import { dollars, relativeTime } from "@/lib/format";
import type { DotHistory, DotState } from "@/lib/types";

type PendingCheckout = {
  checkoutSessionId: string;
  expectedAmountCents: number;
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

export function HomeClient({ initialState, initialHistory, initialStats }: { initialState: DotState; initialHistory: DotHistory[]; initialStats: { total_raised_cents: number; owner_count: number } }) {
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

  const nextPrice = state.amount_cents + 100;

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
        setState((previous: DotState) => next.state.amount_cents !== previous.amount_cents ? next.state : previous);
        setHistory(next.history);
        setTotalRaised(next.stats.total_raised_cents);
        setOwnerCount(next.stats.owner_count);
        applyResult(next.state);
      } catch {}
    };
    const id = window.setInterval(refresh, 5000);
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
    <main className="min-h-screen px-5 py-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between text-[11px] font-medium tracking-wide">
        <span>WhoOwnsTheDot</span>
        <span>live total raised {dollars(totalRaised)}</span>
      </div>

      <section className="flex min-h-[calc(100vh-170px)] flex-col items-center justify-center text-center">
        <div className="dot" aria-label="The dot" />
        <div className="mt-9 flex flex-col items-center">
          <div className="text-base md:text-lg">
            Owned by {ownerHref ? <a className="underline underline-offset-4" href={ownerHref} target="_blank" rel="noreferrer">{state.owner_name}</a> : state.owner_name}
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight md:text-5xl">{dollars(state.amount_cents)}</div>
          <button onClick={openCheckout} className="mt-7 border border-black bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-white hover:text-black disabled:opacity-50">
            Own the dot for {dollars(nextPrice)}
          </button>
          <p className="mt-4 text-[11px] text-neutral-500">No refunds. Own it until someone pays $1 more.</p>
          {owned && <p className="mt-5 text-sm text-green-700">You own the dot.</p>}
          {lost && !owned && <p className="mt-5 text-sm text-red-600">Too slow. Someone else took the dot.</p>}
          {confirming && !owned && !lost && <p className="mt-5 text-sm text-neutral-500">Payment received. Confirming ownership...</p>}
        </div>
      </section>

      <section className="mx-auto max-w-2xl border-t border-black/10 pt-6 pb-10">
        <div className="mb-6 flex justify-between text-xs">
          <span>Total raised <strong>{dollars(totalRaised)}</strong></span>
          <span>Owners <strong>{ownerCount}</strong></span>
        </div>
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate">{dollars(item.amount_cents)} · {safeExternalUrl(item.owner_url) ? <a className="underline underline-offset-2" href={safeExternalUrl(item.owner_url) ?? undefined} target="_blank" rel="noreferrer">{item.owner_name}</a> : item.owner_name}</span>
              <span className="shrink-0 text-neutral-400">{relativeTime(item.created_at)}</span>
            </div>
          ))}
          {history.length === 0 && <div className="text-sm text-neutral-400">Nobody has bought the dot yet.</div>}
        </div>

        <details className="mt-12 text-xs text-neutral-500">
          <summary className="cursor-pointer text-black">FAQ</summary>
          <div className="mt-4 space-y-3 leading-5">
            <p><strong>Is this real?</strong> Yes. You pay, you own the dot, until someone pays $1 more.</p>
            <p><strong>What do I get?</strong> Your name under the dot and a place in history. That is the product.</p>
            <p><strong>Refunds?</strong> No.</p>
            <p><strong>Why?</strong> Because it is funny.</p>
          </div>
        </details>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-5" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="w-full max-w-sm border border-black bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="checkout-title" className="text-xl font-semibold">Own the dot</h2><p className="mt-1 text-xs text-neutral-500">You will pay {dollars(nextPrice)}.</p></div>
              <button className="text-xl leading-none" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <label className="mt-6 block text-xs font-medium">Display name</label>
            <input autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full border border-black px-3 py-3 outline-none focus:ring-1 focus:ring-black" placeholder="alice" />
            <label className="mt-4 block text-xs font-medium">Optional link</label>
            <input maxLength={300} value={url} onChange={(e) => setUrl(e.target.value)} className="mt-2 w-full border border-black px-3 py-3 outline-none focus:ring-1 focus:ring-black" placeholder="@alice or https://…" />
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <button disabled={busy || name.trim().length < 2} onClick={checkout} className="mt-6 w-full bg-black px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Opening checkout…" : `Pay ${dollars(nextPrice)}`}</button>
            <p className="mt-3 text-[10px] leading-4 text-neutral-400">No refunds. Your ownership is public.</p>
          </div>
        </div>
      )}
    </main>
  );
}
