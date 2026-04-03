# Railway Repair Service Setup Instructions

## Goal
Deploy the Python FastAPI repair service (`services/repair/`) to Railway so it can:
- Accept repair jobs from the dashboard worker
- Run the repair orchestrator (beam search, patch generation, evaluation)
- Write results back to Supabase
- Provide `/config` endpoint for live parameter tuning

## Prerequisites
- Repair service code exists at `services/repair/` with:
  - `repair_engine/` package (v1.0, cloud-adapted)
  - `api/main.py` (FastAPI entry point)
  - `api/routes/repair.py`, `api/routes/config.py`, `api/routes/health.py`
- Supabase project created with repair tables:
  - `repair_jobs`, `repair_candidates`, `orchestration_events`, `model_usage`
- Third-party API keys available:
  - ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
  - QDRANT_API_KEY (for Qdrant Cloud vector store)

## Step 1: Create Deployment Files

### Create `services/repair/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for build tools
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY services/repair/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire repair service
COPY services/repair/ .

# Expose port (Railway provides PORT env var at runtime)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the FastAPI app
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Create `services/repair/railway.toml`

```toml
[build]
# Use Docker for build (most flexible for Python + system dependencies)
builder = "dockerfile"
dockerfilePath = "services/repair/Dockerfile"

[deploy]
# Railway sets PORT env var; don't hardcode 8000
restartPolicyMaxRetries = 3

# Optional: specify build args if needed
# buildArgs = ["PYTHON_VERSION=3.11"]
```

### Update `services/repair/requirements.txt`

Ensure all dependencies are present. Minimal set:

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
supabase==2.3.1
python-dotenv==1.0.0
anthropic==0.7.0
openai==1.3.0
google-generativeai==0.3.0
qdrant-client==2.7.0
pydantic==2.5.0
python-multipart==0.0.6
httpx==0.25.2
```

If `services/repair/` has existing dependencies (numpy, etc. from v1.0), keep them.

### Create `services/repair/.dockerignore`

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv
*.egg-info/
.pytest_cache/
.coverage
.DS_Store
```

## Step 2: Create or Configure Railway Project

### Option A: Add to Existing Railway Project (RECOMMENDED)

1. Go to existing Railway project (penny-dashboard/penny-worker)
2. Click **+ New**
3. Select **GitHub Repo** → select your `penny` monorepo
4. Railway will auto-detect; select/create `penny-repair` service
5. Configure build:
   - **Builder**: Dockerfile
   - **Dockerfile path**: `services/repair/Dockerfile`
   - **Root directory**: `services/repair/` (optional, helps Railway)

### Option B: New Standalone Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **New Project**
3. Select **GitHub Repo** → `penny`
4. When asked which service, select or create `penny-repair`
5. Same build config as Option A

## Step 3: Set Environment Variables

In Railway dashboard, go to **[service-name] → Variables** and add:

### Required (No Defaults)

```
REPAIR_SERVICE_SECRET=<generate 32-char random string: openssl rand -hex 16>
SUPABASE_URL=<your-project-url, e.g., https://xyz.supabase.co>
SUPABASE_SERVICE_ROLE_KEY=<copy from Supabase Settings > API > service_role key>
ANTHROPIC_API_KEY=<from Anthropic console>
OPENAI_API_KEY=<from OpenAI account>
GEMINI_API_KEY=<from Google Cloud console>
PENNY_QDRANT_URL=<from Qdrant Cloud, e.g., https://xyz.qdrant.io:6333>
QDRANT_API_KEY=<from Qdrant Cloud dashboard>
```

### Optional (Defaults Provided in Code)

```
LOG_LEVEL=info
REPAIR_TIMEOUT_SECONDS=1800
MAX_PATCH_SIZE_BYTES=50000
```

## Step 4: Deploy

1. **Manual deploy** (for testing):
   - Click **Deploy** button in Railway dashboard
   - Watch logs in **Deployments** tab
   - Should see: `Uvicorn running on 0.0.0.0:8000`

2. **Auto-deploy**:
   - Railway auto-deploys on push to main branch
   - Trigger by: `git push origin main`
   - Monitor in Railway dashboard

## Step 5: Verify Deployment

Once deployed, Railway assigns a public URL. Find it:
- Dashboard → [service] → **Deployments** → copy URL

Test endpoints:

```bash
# Health check (should return 200)
curl https://repair-service-xyz.up.railway.app/health

# Get config (should return 200)
curl -H "Authorization: Bearer $REPAIR_SERVICE_SECRET" \
  https://repair-service-xyz.up.railway.app/config

# Submit a repair job (should return 201)
curl -X POST https://repair-service-xyz.up.railway.app/repair/run \
  -H "Authorization: Bearer $REPAIR_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "finding_id": "test-finding",
    "code_context": "def foo(): pass",
    "repair_config": {
      "beam_width": 4,
      "max_depth": 3
    }
  }'
```

## Step 6: Connect Dashboard to Repair Service

Update `apps/dashboard/.env.local`:

```
REPAIR_SERVICE_URL=https://repair-service-xyz.up.railway.app
REPAIR_SERVICE_SECRET=<same secret from Railway variables>
```

Then test from dashboard:
- `apps/dashboard/app/api/repair-jobs/route.ts` calls `REPAIR_SERVICE_URL`
- Should create rows in Supabase `repair_jobs` table

## Troubleshooting

### Build Fails: "ModuleNotFoundError: No module named 'uvicorn'"
- Check `requirements.txt` exists at `services/repair/requirements.txt`
- Verify Dockerfile `COPY` paths are correct relative to monorepo root

### Build Fails: "gcc: command not found"
- Dockerfile includes `apt-get install gcc` — ensure it's there
- Some dependencies (numpy, etc.) require C compiler

### Service Crashes on Start: "port already in use"
- Railway sets PORT env var; don't hardcode 8000
- Check `uvicorn` command uses `$PORT` or remove hardcoded port

### Service Crashes: "ModuleNotFoundError: No module named 'repair_engine'"
- Check working directory in Dockerfile is `/app`
- Verify `COPY services/repair/ .` copies entire directory
- Test locally: `cd services/repair && python -m uvicorn api.main:app`

### Timeout on First Request
- Cold start takes 10-30s with large dependencies
- Enable **"Always On"** in Railway settings if available (paid feature)

### Supabase Connection Fails
- Verify `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
- Check repair tables exist: `repair_jobs`, `repair_candidates`, `orchestration_events`
- Ensure RLS policies allow service-role writes

### Health Check Fails
- Check `api/health.py` exists and returns valid response
- Logs in Railway dashboard show exact error

## Post-Deployment Checklist

- [ ] Dockerfile builds successfully (no errors in Railway logs)
- [ ] Service starts (see "Uvicorn running" in logs)
- [ ] Health endpoint returns 200
- [ ] Config endpoint returns 200 with Bearer token
- [ ] Dashboard can reach REPAIR_SERVICE_URL
- [ ] Test repair job creates entries in Supabase
- [ ] Repair orchestrator runs without crashing
- [ ] Candidates are written to `repair_candidates` table
- [ ] Events are written to `orchestration_events` table

## Files Created/Modified

```
services/repair/
├── Dockerfile (NEW)
├── railway.toml (NEW)
├── .dockerignore (NEW)
├── requirements.txt (UPDATED if needed)
├── api/
│   ├── main.py (EXISTING)
│   ├── routes/repair.py (EXISTING)
│   ├── routes/config.py (EXISTING)
│   └── routes/health.py (EXISTING)
└── repair_engine/ (EXISTING v1.0)

apps/dashboard/
└── .env.local (UPDATED with REPAIR_SERVICE_URL, REPAIR_SERVICE_SECRET)
```

## Next Steps

Once repair service is deployed and verified:
1. Test end-to-end: submit repair job from dashboard
2. Monitor repair progress via RepairJobMonitor component
3. Verify PR creation via repair-callback Edge Function
4. Set up Sentry for error tracking (optional but recommended)
