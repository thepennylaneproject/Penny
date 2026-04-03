# Agent Prompt: Set Up Repair Service on Railway

Use this prompt with the Agent tool (general-purpose agent) to automate the repair service Railway setup:

---

## Prompt

```
You are setting up a Python FastAPI repair service for deployment to Railway.

Current state:
- Monorepo location: /Users/sarahsahl/penny
- Repair service code: services/repair/ (contains api/main.py, repair_engine/, etc.)
- Dashboard already deployed to Netlify
- Worker already deployed to Railway (as penny-worker)
- Supabase project exists with repair tables (repair_jobs, repair_candidates, orchestration_events, model_usage)

Goal:
Deploy services/repair to Railway so the repair orchestrator can accept jobs and write results to Supabase.

Requirements:
1. Create Dockerfile at services/repair/Dockerfile
   - Use python:3.11-slim as base
   - Copy requirements.txt and install dependencies
   - Copy entire services/repair/ directory
   - Run: python -m uvicorn api.main:app --host 0.0.0.0 --port $PORT
   - Include health check

2. Create railway.toml at services/repair/railway.toml
   - Set builder to dockerfile
   - Set dockerfilePath to services/repair/Dockerfile

3. Create .dockerignore at services/repair/.dockerignore
   - Exclude __pycache__, *.pyc, venv, .pytest_cache, etc.

4. Verify requirements.txt exists at services/repair/requirements.txt
   - Must include: fastapi, uvicorn, supabase, anthropic, openai, google-generativeai, qdrant-client, pydantic, python-dotenv, httpx
   - Add any additional dependencies found in services/repair/api/ or repair_engine/

5. DO NOT deploy yet — just create the files and verify they're correct

Reference document: /Users/sarahsahl/penny/RAILWAY_REPAIR_SERVICE_SETUP.md (contains full Dockerfile, railway.toml, and .dockerignore examples)

Steps:
- Read RAILWAY_REPAIR_SERVICE_SETUP.md to get exact file contents
- Create Dockerfile, railway.toml, .dockerignore in services/repair/
- Verify requirements.txt has all dependencies
- Check all files have correct syntax (valid TOML, valid Dockerfile)
- Git add and commit all new/modified files with message: "Add Railway deployment config for repair service"
- Output a summary of what was created

Do not:
- Modify api/main.py or repair_engine code
- Create environment variables (user will do that in Railway dashboard)
- Deploy to Railway (user will trigger via dashboard or git push)
- Modify any other service code (only services/repair/)
```

---

## How to Use

In Claude Code, run:

```
/agent -t general-purpose -d "Set up Railway deployment files for repair service"

[Paste the prompt above]
```

Or invoke programmatically if you have agent tooling set up.

## Expected Output

The agent should:
1. Create `services/repair/Dockerfile` ✅
2. Create `services/repair/railway.toml` ✅
3. Create `services/repair/.dockerignore` ✅
4. Verify/update `services/repair/requirements.txt` ✅
5. Git commit all files ✅
6. Print summary of what was created

## What to Do After

Once files are created:

1. **Push to git:**
   ```bash
   git push origin main
   ```

2. **In Railway dashboard:**
   - Go to your existing penny project
   - Click **+ New** → **GitHub Repo**
   - Select penny repo, configure for `services/repair`
   - Set environment variables (see RAILWAY_REPAIR_SERVICE_SETUP.md Step 3)
   - Click **Deploy**

3. **Verify deployment:**
   ```bash
   curl https://repair-service-[railroad-id].up.railway.app/health
   ```

4. **Update dashboard .env:**
   ```
   REPAIR_SERVICE_URL=https://repair-service-[railroad-id].up.railway.app
   REPAIR_SERVICE_SECRET=<your-secret-from-railway>
   ```

5. **Test end-to-end:**
   - Open dashboard
   - Go to a finding
   - Click "Configure Auto-Repair"
   - Submit a repair job
   - Monitor progress in RepairJobMonitor

## Files Reference

See `/Users/sarahsahl/penny/RAILWAY_REPAIR_SERVICE_SETUP.md` for:
- Complete Dockerfile contents
- Complete railway.toml contents
- Complete .dockerignore contents
- Troubleshooting guide
- Environment variables checklist
```

---

## Alternative: DIY Script

If you prefer to do it manually instead of using an agent, you can:

```bash
cd /Users/sarahsahl/penny

# Copy the files from the setup guide
# Then commit:
git add services/repair/Dockerfile services/repair/railway.toml services/repair/.dockerignore
git commit -m "Add Railway deployment config for repair service"
git push origin main
```

Which approach do you prefer?
