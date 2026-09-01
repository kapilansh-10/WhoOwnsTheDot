"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen flex-col items-center justify-center bg-white text-center"><div className="dot" /><p className="mt-8 text-sm">the dot is having a moment</p><button onClick={reset} className="mt-4 border border-black px-4 py-2 text-xs">try again</button></main>;
}
