# Repair Service API Implementation Complete

**Status:** ✅ Complete — 8 files created, ready for Railway deployment

---

## Files Created

```
services/repair/api/
├── __init__.py                  Package marker
├── auth.py                      Bearer token authentication (REPAIR_SERVICE_SECRET)
├── supabase_client.py           Lazy singleton Supabase client
├── main.py                      FastAPI app, lifespan, routers
└── routes/
    ├── __init__.py              Package marker
    ├── health.py                GET /health (no auth)
    ├── repair.py                POST /repair/run, GET /repair/{id}
    └── config.py                GET /config, PUT /config (live tuning)
```

**Total:** 8 files, ~530 lines of code

---

## API Endpoints

### Health (No Auth Required)
```
GET /health                     → 200 {"status": "ok", "service": "repair"}
```

### Repair Jobs (Bearer Auth Required)
```
POST /repair/run                → 202 {"repair_job_id": str, "status": "queued", ...}
  Request: {finding: FindingInput, project_id?: str}
  
GET /repair/{repair_job_id}     → 200 {"repair_job_id": str, "status": str, ...}
  Returns: Full repair job record from Supabase
  Error: 404 if not found
```

### Configuration (Bearer Auth Required)
```
GET /config                     → 200 {search: {...}, evaluation: {...}, apply: {...}}
  Returns: Current EngineConfig (API keys redacted)
  
PUT /config                     → 200 {"status": "updated", "config": {...}}
  Request: {search?: SearchConfigUpdate, evaluation?: EvaluationConfigUpdate, apply?: ApplyConfigUpdate}
  Partial update: only provided fields are changed
```

---

## Architecture

### Async Job Execution

Long-running repairs (5–30 minutes) are dispatched off the request thread:

```
POST /repair/run
  ↓
1. Validate finding input
2. Generate repair_job_id = uuid4()
3. INSERT repair_jobs (status="queued") into Supabase
4. loop.run_in_executor(ThreadPoolExecutor, _run_job, ...) — returns immediately
5. Return 202 Accepted

[Executor thread]
  ↓
_run_job(repair_job_id, finding, orchestrator, supabase):
  ├─ UPDATE repair_jobs SET status="running", started_at=now()
  ├─ result = orchestrator.run_for_finding(finding)  ← 5-30 min blocking call
  ├─ UPDATE repair_jobs SET status=result.status, best_candidate_id, completed_at
  └─ [On exception: UPDATE status="failed", error_message, completed_at]

[Caller]
  ↓
GET /repair/{repair_job_id}  (polling)
  → SELECT * FROM repair_jobs WHERE repair_job_id = ...
  → Return current status
```

### Key Design Choices

| Decision | Rationale |
|----------|-----------|
| **ThreadPoolExecutor(max_workers=4)** | `run_for_finding` is sync + blocking; threads isolate it from event loop. Max 4 prevents OOM on Railway. |
| **asyncio.to_thread() in GET /repair/{id}** | Sync Supabase client can't be awaited; `to_thread` prevents blocking event loop. |
| **In-memory config mutations** | Simpler than persisting to DB. Ephemeral (lost on restart). Acceptable for operational tuning. |
| **Providers/integrations not in PUT /config** | Changing LLM keys or Redis URL requires re-initializing gateway/evaluator/queue — restart-level operation. |
| **Redacted API keys in GET /config** | Any dict key containing "api_key", "secret", "token", "password" → `"***"` for security. |
| **Outer try/except in _run_job** | Catches all failures (Docker, LLM timeout, OOM, etc.) and writes to error_message. Job always reaches terminal state. |

---

## Startup Flow

```python
app.lifespan() [startup]:
  1. Assert REPAIR_SERVICE_SECRET is set → fail fast if missing
  2. EngineConfig() — reads all penny_* env vars
  3. RepairOrchestrator(repo_root, config) — init gateway, evaluator, queue, memory
  4. ThreadPoolExecutor(max_workers=4) — init thread pool
  5. Store in app.state (app.state.orchestrator, app.state.executor)
  6. Mount health router (no auth)
  7. Mount repair router (requires Bearer auth)
  8. Mount config router (requires Bearer auth)
  [yield] — app is running
  
app.lifespan() [shutdown]:
  1. executor.shutdown(wait=False) — graceful shutdown
```

---

## Authentication

All endpoints except `GET /health` require:
```
Authorization: Bearer <REPAIR_SERVICE_SECRET>
```

Implemented via FastAPI dependency `require_auth`:
- Parses `Authorization` header
- Extracts scheme + token
- Compares token to `REPAIR_SERVICE_SECRET` env var
- Raises 401 if invalid
- Raises 503 if secret is not configured

Applied to routers via:
```python
app.include_router(repair.router, dependencies=[Depends(require_auth)])
```

---

## Database Writes

All Supabase writes use service-role key (not anon), with columns:

### repair_jobs table (POST /repair/run)
```python
{
    "repair_job_id": str (uuid),
    "finding_id": str,
    "project_id": str | None,
    "status": "queued",
    "confidence_score": None,
    "confidence_breakdown": None,
    "action": None,
    "progress": None,
    "best_candidate_id": None,
    "best_score": None,
    "pr_id": None,
    "pr_number": None,
    "pr_url": None,
    "error_message": None,
    "created_at": str (ISO 8601),
}
```

### repair_jobs table (UPDATE during _run_job)
```python
# On running
{"status": "running", "started_at": ISO 8601}

# On success
{"status": "<engine_status>", "best_candidate_id": str, "completed_at": ISO 8601}

# On failure
{"status": "failed", "error_message": str[:2000], "completed_at": ISO 8601}
```

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Missing REPAIR_SERVICE_SECRET | 503 on startup (fails to initialize) |
| Missing SUPABASE_URL/KEY | 503 on first Supabase call |
| Invalid Bearer token | 401 Unauthorized |
| Malformed Finding input | 422 Unprocessable Entity (Pydantic validation) |
| Supabase INSERT fails (POST /repair/run) | 503 (do not submit job if tracking fails) |
| Supabase SELECT fails (GET /repair/{id}) | 500 Internal Server Error |
| repair_job_id not found (GET /repair/{id}) | 404 Not Found |
| orchestrator.run_for_finding raises | Job marked "failed" with error_message, thread continues |

---

## Environment Variables Required

| Variable | Purpose | Required |
|----------|---------|----------|
| `REPAIR_SERVICE_SECRET` | Bearer token | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Yes |
| `REPO_ROOT` | Repository root (for orchestrator) | No (default: /app) |
| `WORKER_THREADS` | ThreadPoolExecutor size | No (default: 4) |
| `penny_*` | All EngineConfig env vars | Varies |

Plus all existing `penny_` prefixed vars consumed by `EngineConfig` (see `repair_engine/config.py`).

---

## Testing Locally

```bash
cd services/repair

# Start with environment variables set
export REPAIR_SERVICE_SECRET="test-secret-123"
export SUPABASE_URL="https://..."
export SUPABASE_SERVICE_ROLE_KEY="..."

# Run the server
python -m uvicorn api.main:app --port 8001 --reload

# Test health (no auth)
curl http://localhost:8001/health

# Test config (with auth)
curl -H "Authorization: Bearer test-secret-123" \
  http://localhost:8001/config

# Submit a repair job (with auth)
curl -X POST http://localhost:8001/repair/run \
  -H "Authorization: Bearer test-secret-123" \
  -H "Content-Type: application/json" \
  -d '{
    "finding": {
      "finding_id": "test-123",
      "type": "missing_check",
      "category": "safety",
      "severity": "major",
      "priority": "high",
      "confidence": "90",
      "title": "Missing null check",
      "description": "...",
      "impact": "Potential NullPointerException",
      "status": "open"
    },
    "project_id": "my-project"
  }'
```

---

## Railway Deployment

1. **Files already created:**
   - `services/repair/Dockerfile` ✅
   - `services/repair/railway.toml` ✅
   - `services/repair/.dockerignore` ✅
   - `services/repair/requirements.txt` ✅

2. **Files just created:**
   - `services/repair/api/` (complete) ✅

3. **Ready to deploy:**
   ```bash
   git push origin main
   # Railway auto-deploys via GitHub integration
   ```

4. **Configure in Railway dashboard:**
   - Go to penny project
   - Click **+ New** → GitHub Repo
   - Select `services/repair`
   - Add environment variables (see "Environment Variables Required" section)
   - Click **Deploy**

5. **Verify:**
   ```bash
   curl https://repair-service-[id].up.railway.app/health
   ```

---

## Code Structure

### `api/main.py`
- FastAPI app factory with lifespan context
- Validates REPAIR_SERVICE_SECRET on startup
- Initializes EngineConfig, RepairOrchestrator, ThreadPoolExecutor
- Mounts 3 routers

### `api/auth.py`
- Single dependency function: `require_auth`
- Checks Authorization header

### `api/supabase_client.py`
- Lazy singleton pattern
- `get_supabase()` returns service-role client

### `api/routes/health.py`
- Simple health check endpoint

### `api/routes/repair.py`
- POST /repair/run: submit job, dispatch to executor
- GET /repair/{id}: fetch job status
- Helper: `_run_job` (sync function for executor thread)

### `api/routes/config.py`
- GET /config: return current config (redacted)
- PUT /config: partial update to search/evaluation/apply
- Helper: `_safe_config_dict` (redact API keys)

---

## Summary

✅ **API layer complete and ready for deployment**
- 8 files, ~530 lines of code
- All 5 endpoints implemented (health + repair + config)
- Proper async/sync handling with ThreadPoolExecutor
- Bearer token authentication
- Supabase integration
- Error handling for all scenarios
- Production-ready code structure

🚀 **Next steps:**
1. Configure Railway project with environment variables
2. Deploy via git push or Railway dashboard
3. Test endpoints with curl
4. Monitor logs in Railway dashboard
5. Connect dashboard `/api/repair-jobs` endpoints to this service

⚠️ **Important:**
- The Dockerfile and railway.toml already exist and reference `api.main:app` correctly
- requirements.txt already has FastAPI, uvicorn, supabase dependencies
- Make sure all `penny_` environment variables are set in Railway for EngineConfig initialization
