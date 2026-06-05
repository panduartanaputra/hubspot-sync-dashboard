# HubSpot Sync Dashboard

Interactive lead pipeline + real-time HubSpot handoff dashboard for the supabase-lab simulation.

## Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

`.env.local` already contains the Supabase URL + publishable anon key for the `supabase-lab` project. The dashboard talks directly to Supabase from the browser. All RLS is OFF on this lab project — for any real deployment you would gate writes behind RLS policies or Next.js API routes.

## Vercel deploy

1. Push this folder to a new GitHub repo.
2. In Vercel: **New project** → import the repo.
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Vercel auto-detects Next.js.

## How it connects

- Reads `organizations`, `persons`, `opportunities`, `meetings`, `opportunity_persons`, `sync_log` from Supabase.
- Writes:
  - **Book meeting** → INSERT into `meetings` with `status='booked'` → DB trigger fires `pg_net.http_post` → edge function `push-lead-to-hubspot` → HubSpot Contact + Deal created.
  - **Mark held / no-show / cancelled** → UPDATE `meetings.status` → same trigger → edge function updates the HubSpot deal stage.
  - **Disqualify** → UPDATE `opportunities.status='disqualified'` (no HubSpot push for this — handoff hasn't happened yet).
- Polls every 5s for fresh data (lab-grade; you'd want Supabase Realtime in production).
