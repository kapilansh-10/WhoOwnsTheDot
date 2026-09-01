import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen flex-col items-center justify-center bg-white text-center"><div className="dot" /><p className="mt-8 text-sm">this page is not the dot</p><Link href="/" className="mt-4 text-xs underline underline-offset-4">go to the dot</Link></main>;
}
