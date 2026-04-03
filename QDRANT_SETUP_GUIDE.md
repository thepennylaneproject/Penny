# Qdrant Setup Guide for Penny Repair Service

**Purpose:** Qdrant Cloud vector database stores patch embeddings for the repair engine's memory/seeding mechanism.

---

## What Qdrant Does

The repair engine uses Qdrant to:
1. **Remember successful patches** — when a repair works, store the finding signature + patch candidate
2. **Seed future repairs** — for similar findings, retrieve and reuse high-scoring previous patches
3. **Improve efficiency** — avoid regenerating the same patch multiple times

**Collection structure:**
- **Vectors**: 32-dimensional embeddings (hashed from finding signature)
- **Distance metric**: Cosine similarity
- **Payloads**: Finding ID, signature, score, candidate patch JSON

---

## Step 1: Create Qdrant Cloud Account

1. Go to [cloud.qdrant.io](https://cloud.qdrant.io)
2. Sign up or log in
3. Go to **Clusters** → **Create Cluster**
4. Configure:
   - **Cluster name**: `penny-repair` (or your choice)
   - **Tier**: Free (suitable for development) or paid
   - **Region**: Pick closest to your Railway region (US-West recommended if using Railway)
5. Click **Create**
6. Wait for cluster to be ready (2-5 minutes)

---

## Step 2: Get Connection Details

1. In Qdrant Cloud dashboard, go to your cluster
2. Click **Connect**
3. You'll see:
   - **REST API URL**: e.g., `https://xyz-abc123.qdrant.io:6333`
   - **API Key**: e.g., `sk_abc123...`

**Copy these — you'll need them in the next step.**

---

## Step 3: Configure Railway Environment Variables

In your Railway dashboard for the repair service, add:

```
penny_QDRANT_URL=https://xyz-abc123.qdrant.io:6333
penny_QDRANT_COLLECTION=penny_patch_memory
QDRANT_API_KEY=sk_abc123...
```

**Important:**
- URL should be `https://` (not http) for Qdrant Cloud
- Include the `:6333` port
- API key format varies by Qdrant version — paste exactly as shown in Qdrant Cloud

---

## Step 4: Initialize the Collection (One-Time)

The repair service will auto-create the collection on first use via `ensure_collection()`, which sends:

```http
PUT /collections/penny_patch_memory
{
  "vectors": {
    "size": 32,
    "distance": "Cosine"
  }
}
```

**To initialize manually** (recommended for verification):

### Option A: Using curl

```bash
export QDRANT_URL="https://xyz-abc123.qdrant.io:6333"
export QDRANT_API_KEY="sk_abc123..."
export COLLECTION="penny_patch_memory"

curl -X PUT \
  "${QDRANT_URL}/collections/${COLLECTION}" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 32,
      "distance": "Cosine"
    }
  }'

# Should return 200 or 204
```

### Option B: Using Qdrant Cloud Web UI

1. Go to your cluster in Qdrant Cloud
2. Click **Collections** → **Create Collection**
3. Fill in:
   - **Collection name**: `penny_patch_memory`
   - **Vector size**: 32
   - **Distance metric**: Cosine
4. Click **Create**

### Option C: Let the Service Create It

The repair service will auto-create the collection on first `POST /repair/run` that uses seeding. Watch the Railway logs — you should see "ensure_collection" succeed.

---

## Step 5: Verify Setup

### Check Collection Exists

```bash
curl -X GET \
  "https://xyz-abc123.qdrant.io:6333/collections" \
  -H "api-key: sk_abc123..."

# Should include penny_patch_memory in the response
```

### Check Service Can Connect

Once deployed to Railway, look for these log messages:

```
✓ Repair orchestrator initialized (repo_root=/app)
```

If Qdrant connection fails, you'll see:
```
✗ Failed to initialize service: Qdrant ... failed (401): ...
```

If you see that, check:
1. `penny_QDRANT_URL` is spelled correctly and matches Qdrant Cloud
2. `QDRANT_API_KEY` is exact (copy-paste again)
3. Qdrant cluster is running in Qdrant Cloud dashboard

---

## Environment Variable Reference

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `penny_QDRANT_URL` | Qdrant cluster REST API endpoint | `https://xyz.qdrant.io:6333` | Yes (Cloud) |
| `penny_QDRANT_COLLECTION` | Collection name for patches | `penny_patch_memory` | No (default shown) |
| `QDRANT_API_KEY` | API key for Qdrant Cloud auth | `sk_abc123...` | Yes (Cloud only) |

---

## Snapshots / Backups

Qdrant Cloud does **not provide automatic snapshots** in the free tier, but you can:

### Option 1: Export Data (DIY Backup)

```bash
# Get all points from collection
curl -X POST \
  "https://xyz-abc123.qdrant.io:6333/collections/penny_patch_memory/points/scroll" \
  -H "api-key: sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"limit": 1000}' \
  > penny_patches_backup.json

# This exports all stored patches to a JSON file you can keep
```

### Option 2: Paid Tier Snapshots

If using a paid Qdrant Cloud cluster:
- Snapshots are available via the Qdrant Cloud API
- Refer to [Qdrant Cloud documentation](https://cloud.qdrant.io/docs/snapshots)

### Option 3: Rebuild from Supabase

Since `repair_candidates` rows are stored in Supabase with full patch data, you can always re-populate Qdrant:

```python
# Pseudo-code: re-seed memory from successful repairs
for repair_job in supabase.repair_jobs.where(status="completed"):
    for candidate in supabase.repair_candidates.where(repair_job_id=..., score > 0.9):
        qdrant.remember_success(finding, candidate, candidate.score)
```

This is not automated yet but is a recovery path if Qdrant data is lost.

---

## Local Development (Without Qdrant Cloud)

If developing locally without Qdrant Cloud:

1. **Option A: Run Qdrant Docker**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
   Then set: `penny_QDRANT_URL=http://localhost:6333`

2. **Option B: Mock the memory store**
   Set `penny_QDRANT_URL=""` and the engine will skip memory lookups (degrades performance but works)

---

## Troubleshooting

### "Qdrant ... failed (401): ..."
- **Cause**: Invalid API key
- **Fix**: Double-check `QDRANT_API_KEY` in Railway env vars (copy from Qdrant Cloud again)

### "Qdrant ... failed (404): ..."
- **Cause**: Collection doesn't exist
- **Fix**: Run curl command in "Option A: Using curl" above to create collection manually

### "Qdrant ... failed (connection timeout)..."
- **Cause**: Network connectivity issue or URL wrong
- **Fix**: 
  1. Verify `penny_QDRANT_URL` is correct (should be `https://` and include `:6333`)
  2. Test from Railway pod: `curl https://xyz.qdrant.io:6333/health` in a temporary shell

### "Service starts but seeding doesn't work"
- **Cause**: Qdrant is running but empty
- **Fix**: This is normal on first run. The memory will populate as repairs complete.

---

## Testing the Integration

Once repair service is deployed to Railway:

### 1. Submit a Repair Job
```bash
curl -X POST https://repair-service.railway.app/repair/run \
  -H "Authorization: Bearer $REPAIR_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"finding": {...}, "project_id": "test"}'
```

### 2. Wait for Completion
```bash
curl -H "Authorization: Bearer $REPAIR_SERVICE_SECRET" \
  https://repair-service.railway.app/repair/{repair_job_id}
```

### 3. Check Qdrant for Stored Patches
```bash
curl -X POST \
  "https://xyz-abc123.qdrant.io:6333/collections/penny_patch_memory/points/search" \
  -H "api-key: sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"vector": [0.1, 0.2, ...], "limit": 5}'
```

If you see stored patches, seeding is working.

---

## Summary

| Step | Action | Time |
|------|--------|------|
| 1 | Create Qdrant Cloud account + cluster | 5 min |
| 2 | Copy connection URL + API key | 1 min |
| 3 | Add env vars to Railway | 2 min |
| 4 | Create collection (manual or auto) | 1 min |
| 5 | Deploy repair service | 5 min |
| 6 | Test with curl | 2 min |

**Total**: ~15 minutes

---

## Reference

- [Qdrant Cloud Docs](https://cloud.qdrant.io/docs)
- [Qdrant REST API Reference](https://qdrant.tech/documentation/quick-start/rest-api/)
- Repair engine code: `services/repair/repair_engine/memory/qdrant_store.py`
