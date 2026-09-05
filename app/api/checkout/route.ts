import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createDotCheckout } from "@/lib/dodo";
import { cleanName, cleanUrl } from "@/lib/validation";
import { isValidStagedImagePath } from "@/lib/dot-image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ownerName = cleanName(body?.name);
    const ownerUrl = cleanUrl(body?.url);
    if (!ownerName) return NextResponse.json({ error: "Name must be 2–32 characters." }, { status: 400 });
    if (body?.url && !ownerUrl) return NextResponse.json({ error: "Enter a valid URL or X handle." }, { status: 400 });
    // Optional staged image path from /api/upload. Pattern-checked here;
    // the file itself was already server-validated at upload time, and the
    // webhook re-validates before promoting it to the owner.
    const imagePath = body?.imagePath == null || body.imagePath === "" ? null : body.imagePath;
    if (imagePath !== null && !isValidStagedImagePath(imagePath)) {
      return NextResponse.json({ error: "Invalid image reference." }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data: state, error } = await supabase.from("dot_state").select("amount_cents").order("updated_at", { ascending: false }).limit(1).single();
    if (error) return NextResponse.json({ error: "Could not read the current dot." }, { status: 500 });

    const expectedAmount = state.amount_cents + 100;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const checkout = await createDotCheckout({
      amountCents: expectedAmount,
      ownerName,
      ownerUrl,
      imagePath,
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
