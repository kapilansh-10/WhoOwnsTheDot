# WhoOwnsTheDot

## What is WhoOwnsTheDot?

The internet has one dot. Pay $1 more than the current owner and it is yours.

It is a tiny viral novelty site: one black circle, one owner, one dollar more to take it. No accounts. No dashboards. No refunds.

## Stack

- Next.js
- TypeScript
- Tailwind
- Supabase
- Dodo Payments
- Vercel

## Environment Variables

Create `.env.local` from `.env.example` and fill in the values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DODO_PAYMENTS_API_KEY=
DODO_WEBHOOK_KEY=
DODO_PRODUCT_ID=
DODO_PAYMENTS_ENVIRONMENT=test_mode
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`DODO_PAYMENTS_ENVIRONMENT` can be `test_mode` for local testing or `live_mode` for production. Do not expose Dodo credentials with `NEXT_PUBLIC_*`.

## Supabase Setup

In the Supabase SQL Editor, run the complete file:

```text
supabase/schema.sql
```

It creates `dot_state`, `dot_history`, public read policies, stats, and the atomic `claim_dot` RPC. The seed owner is `nobody`, with no URL and `0` cents.

## Dodo Setup

1. Create a Dodo Payments account.
2. Create a one-time payment product that supports customer-entered amounts, because checkout sessions pass the next dot price as `product_cart[].amount`.
3. Copy the Product ID into `DODO_PRODUCT_ID`.
4. Configure a webhook endpoint:

```text
https://YOUR_DOMAIN/api/dodo/webhook
```

5. Subscribe to the `payment.succeeded` event.
6. Copy the webhook signing key into `DODO_WEBHOOK_KEY`.
7. Put the API key, webhook key, product ID, environment, and site URL into `.env.local`.

The checkout integration uses Dodo Checkout Sessions. The webhook integration uses Dodo's Standard Webhooks headers and signing key.

## Local Webhook Testing

Dodo's dashboard provides webhook endpoint configuration and delivery tooling. For local development, expose your local Next.js server with a secure tunnel such as ngrok or the Dodo-recommended tunnel workflow from their dashboard/docs, then point the webhook endpoint at:

```text
https://YOUR-TUNNEL-DOMAIN/api/dodo/webhook
```

Run the app locally and complete a test checkout using `DODO_PAYMENTS_ENVIRONMENT=test_mode`.

## Vercel

1. Push the repository to GitHub.
2. Import it into Vercel.
3. Add every variable from `.env.example` as a Vercel environment variable.
4. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
5. Set `DODO_PAYMENTS_ENVIRONMENT=live_mode` for production.
6. Deploy.
7. In Dodo, configure the production webhook endpoint at `/api/dodo/webhook`.

## Payment Behavior

The server reads `dot_state`, calculates `current_amount_cents + 100`, and creates a Dodo checkout session for that exact amount. Buyer name, optional URL, and expected amount are stored in checkout metadata.

Returning to `/?owned=1` does not grant ownership. The Dodo `payment.succeeded` webhook is verified, then the server calls `claim_dot`. The database locks the current row and only updates ownership when the paid amount is greater than the current amount. Duplicate payment IDs cannot create duplicate history rows.

If someone else wins first, the current owner is not overwritten and the page shows `Too slow. Someone else took the dot.`

## Exact Local Commands

```bash
cd WhoOwnsTheDot
npm install
cp .env.example .env.local
# fill in .env.local
# run supabase/schema.sql in Supabase SQL Editor
npm run dev
```

## Launch Tweet

> The internet now has one dot. Pay $1 more and it’s yours.

> I sold a black circle on a white page. That’s the whole startup.

## Production Notes

The app deliberately has no authentication. The server-side Supabase service role is used only for trusted server operations; it is never exposed to the browser. Public clients only receive current state and history.

The price is stored as integer cents. Display formatting happens in the UI, while Dodo receives the exact integer amount in the checkout session.
