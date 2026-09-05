# APC Content OS analytics ingestor

Private Cloudflare Worker for OAuth account connections and the canonical 24-hour, 7-day and 28-day analytics checkpoints. The Worker has no public route; Pages Functions reach it through the `APC_ANALYTICS_CONNECTOR` service binding.

## One-time provider setup

Register these exact OAuth redirects:

- Meta: `https://autismpathwaysconsulting.com/api/content-os/connections/meta/callback`
- TikTok: `https://autismpathwaysconsulting.com/api/content-os/connections/tiktok/callback`
- Google/YouTube: `https://autismpathwaysconsulting.com/api/content-os/connections/youtube/callback`

Set the public identifiers in `wrangler.jsonc`:

- `META_APP_ID`
- `TIKTOK_CLIENT_KEY`
- `GOOGLE_CLIENT_ID`
- Pin `META_GRAPH_API_VERSION` to the approved app version.

Replace the placeholder provider secrets without putting values in source control or chat:

```sh
npx wrangler secret put META_APP_SECRET
npx wrangler secret put TIKTOK_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Do not rotate `APC_CONNECTOR_DATA_KEY_V1` after accounts are connected without first implementing a token re-encryption migration.

## Safe rollout

1. Keep `APC_ANALYTICS_INGESTION_ENABLED` set to `false` while configuring OAuth.
2. Deploy, sign in to Content OS, and connect one provider.
3. Add that provider to `APC_ANALYTICS_ENABLED_PROVIDERS` (comma-separated: `meta,tiktok,youtube`).
4. Set `APC_ANALYTICS_INGESTION_ENABLED` to `true` and deploy again.
5. Link each newly published post in Content OS before its 24-hour checkpoint.
6. Check `/api/content-os/ingestion-status` through the authenticated Content OS UI.

The scheduler runs every 30 minutes in UTC. It does not invent retroactive 24-hour, 7-day or 28-day measurements after their approved windows. Existing manual snapshots win a race with automation, and deterministic IDs make retries idempotent.

## Verification

```sh
npm run check
npm test
npm run deploy:dry
```
