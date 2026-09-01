import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createDotCheckout } from "@/lib/dodo";
import { cleanName, cleanUrl } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ownerName = cleanName(body?.name);
    const ownerUrl = cleanUrl(body?.url);
    if (!ownerName) return NextResponse.json({ error: "Name must be 2–32 characters." }, { status: 400 });
    if (body?.url && !ownerUrl) return NextResponse.json({ error: "Enter a valid URL or X handle." }, { status: 400 });

    const supabase = getSupabaseServer();
    const { data: state, error } = await supabase.from("dot_state").select("amount_cents").limit(1).single();
    if (error) return NextResponse.json({ error: "Could not read the current dot." }, { status: 500 });

    const expectedAmount = state.amount_cents + 100;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const checkout = await createDotCheckout({
      amountCents: expectedAmount,
      ownerName,
      ownerUrl,
      returnUrl: `${siteUrl}/?owned=1`,
      cancelUrl: `${siteUrl}/`,
    });

    return NextResponse.json({
      url: checkout.checkoutUrl,
      checkout_session_id: checkout.checkoutSessionId,
      expected_amount_cents: expectedAmount,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not create checkout." }, { status: 500 });
  }
}
