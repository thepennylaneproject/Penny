# Railway Repair Service Deployment Checklist

Complete this checklist to deploy the repair service to Railway.

---

## Pre-Deployment (10 minutes)

### Qdrant Setup
- [ ] Create Qdrant Cloud account at [cloud.qdrant.io](https://cloud.qdrant.io)
- [ ] Create a cluster named `penny-repair` (free tier OK)
- [ ] Copy cluster URL (e.g., `https://xyz-abc123.qdrant.io:6333`)
- [ ] Copy API key (e.g., `sk_abc123...`)
- [ ] Save both in a safe place (you'll paste into Railway)

### GitHub App (if not done)
- [ ] Go to GitHub Settings → Developer settings → GitHub Apps → New
- [ ] Create app `penny-repair` with:
  - Webhook URL: `https://your-supabase-project.supabase.co/functions/v1/repair-callback`
  - Webhook secret: Generate random string (save as `GITHUB_WEBHOOK_SECRET`)
  - Permissions: Contents (R/W), Pull Requests (R/W)
- [ ] Copy App ID → `GITHUB_APP_ID`
- [ ] Generate private key → save as `GITHUB_APP_PRIVATE_KEY`

---

## Railway Deployment (5 minutes)

### Create/Configure Repair Service in Railway

1. Go to your Railway project (penny-dashboard + penny-worker already there)

2. Click **+ New** → **GitHub Repo**

3. Select `penny` repo

4. When asked which service, select or create **penny-repair**

5. **Build configuration:**
   - Builder: Dockerfile
   - Dockerfile path: `services/repair/Dockerfile`

6. Once service is created, click on **penny-repair** → **Variables**

7. Add these environment variables:

```
# Authentication
REPAIR_SERVICE_SECRET=<generate-32-char-random>

# Supabase
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Qdrant
penny_QDRANT_URL=<qdrant-cloud-url>:6333
penny_QDRANT_COLLECTION=penny_patch_memory
QDRANT_API_KEY=<qdrant-api-key>

# GitHub
GITHUB_APP_ID=<app-id>
GITHUB_APP_PRIVATE_KEY=<private-key>
GITHUB_WEBHOOK_SECRET=<webhook-secret>

# Engine tuning (optional, can use defaults)
penny_ROOT_BRANCHING_FACTOR=5
penny_BEAM_WIDTH=2
penny_MAX_DEPTH=2
penny_MAX_EVALS_PER_FINDING=20
penny_EVAL_TIMEOUT_SECONDS=300

# LLM API keys (required)
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>
```

8. Click **Deploy** (or Railway auto-deploys on git push)

9. Watch logs in Railway dashboard → **Deployments** → latest

---

## Post-Deployment Verification (3 minutes)

Once deployed, Railway assigns a public URL (e.g., `https://penny-repair-xyz.up.railway.app`):

### 1. Health Check
```bash
curl https://penny-repair-xyz.up.railway.app/health
# Expected: {"status": "ok", "service": "repair"}
```

### 2. Config Endpoint (requires Bearer token)
```bash
curl -H "Authorization: Bearer $REPAIR_SERVICE_SECRET" \
  https://penny-repair-xyz.up.railway.app/config
# Expected: JSON with search, evaluation, apply configs
```

### 3. Check Qdrant Connection
In Railway logs, search for `Qdrant`. Should see successful initialization or error if misconfigured.

---

## Connect Dashboard to Repair Service (2 minutes)

### Update Dashboard Environment Variables

In your Netlify dashboard (or `.env.local` if testing locally):

```
REPAIR_SERVICE_URL=https://penny-repair-xyz.up.railway.app
REPAIR_SERVICE_SECRET=<same-secret-from-railway>
```

### Redeploy Dashboard

- Netlify: `git push` to trigger redeploy
- Local: restart dev server

---

## End-to-End Test (5 minutes)

### 1. Submit a Repair Job from Dashboard

1. Go to dashboard
2. Find a finding in any project
3. Click **Configure Auto-Repair**
4. Set parameters (beam_width=3, max_depth=2, etc.)
5. Click **Submit Repair Job**

### 2. Monitor Progress

1. Should see "Queued" status immediately
2. Within 30 seconds, should change to "Running"
3. Watch `RepairJobMonitor` component for progress
4. Wait for completion (5–30 minutes depending on finding complexity)

### 3. Check Supabase

Go to Supabase dashboard → `repair_jobs` table:
- Should see new row with your `finding_id`
- Status should progress: queued → running → completed (or failed)

### 4. Verify Qdrant Populated (Optional)

If repair succeeded with high score:

```bash
curl -X POST \
  "https://xyz-abc123.qdrant.io:6333/collections/penny_patch_memory/points/search" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vector": [0, 0, 0, 0, 0, ...], "limit": 5}'
# Should return patch candidates stored from the repair
```

---

## Troubleshooting

### Service Won't Start

**Check logs in Railway → Deployments:**

| Error | Fix |
|-------|-----|
| `REPAIR_SERVICE_SECRET must be set` | Add env var to Railway |
| `ModuleNotFoundError: fastapi` | Dockerfile or requirements.txt issue |
| `Qdrant ... (401)` | Check QDRANT_API_KEY spelling |
| `Qdrant ... (404)` | Create collection via curl or Qdrant Cloud UI |

### Health Check Returns 503

- Service is starting — wait 10 seconds, try again
- Check Railway logs for startup errors

### POST /repair/run Returns 401

- Check `Authorization: Bearer` header syntax
- Verify `REPAIR_SERVICE_SECRET` env var exactly

### Repair Job Stays "Queued" Forever

- Check Railway logs for exceptions in `_run_job`
- Verify Supabase credentials are correct
- Check ANTHROPIC_API_KEY and other LLM keys are set

---

## Quick Reference: Key URLs and Secrets

```bash
# Qdrant Cloud
echo "Qdrant URL: $penny_QDRANT_URL"
echo "Qdrant API Key: $QDRANT_API_KEY"

# Railway Repair Service
echo "Service URL: $REPAIR_SERVICE_URL"
echo "Service Secret: $REPAIR_SERVICE_SECRET"

# GitHub App
echo "GitHub App ID: $GITHUB_APP_ID"

# Supabase
echo "Supabase URL: $SUPABASE_URL"
```

---

## Next Steps After Deployment

1. **Submit test repairs** from dashboard for various findings
2. **Monitor costs** in `RepairCostEstimator` component
3. **Tune config** via `PUT /config` endpoint or `ProjectRepairConfig` component
4. **Set up PR auto-merge** (if you want automated merging of high-confidence repairs)
5. **Monitor failures** in Railway logs and debug

---

## Support

- Railway docs: https://docs.railway.app
- Qdrant docs: https://docs.qdrant.tech
- Repair service docs: `REPAIR_SERVICE_API_IMPLEMENTATION.md` in repo
