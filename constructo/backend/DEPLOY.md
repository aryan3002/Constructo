# Constructo Backend — Deploy Runbook

**Stack:** Azure Container Apps (API) · Neon (Postgres 16 + pgvector) · Cloudflare R2 (media) · Azure OpenAI (LLM/STT/OCR, your $100 student credit).

**Pilot posture:** one always-on replica (`min=max=1`) running extraction **inline** (`EXTRACTION_SYNC=true` → no Redis/worker) with the **in-process scheduler on** (`ENABLE_SCHEDULER=true` → the 7am brief + sweeps just run). Simple and cheap. Scale out later.

The Dockerfile + entrypoint in this folder are verified (build + boot + `/healthz` 200). The entrypoint runs `alembic upgrade head` then uvicorn.

> Legend: 🧑 = you do it (accounts/secrets) · 🤖 = already done in code.

---

## 0. One-time local prereqs 🧑
```sh
brew install azure-cli
az login
az extension add --name containerapp --upgrade
az provider register -n Microsoft.App
az provider register -n Microsoft.OperationalInsights
```

## 1. Neon — database (~5 min) 🧑
1. https://neon.tech → new project. Region: **AWS ap-south-1 (Mumbai)** or closest to your Azure region.
2. SQL editor → run: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy the **Direct** connection string (the non-pooled one) — looks like
   `postgresql://USER:PASS@ep-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require`
4. **Reformat for this app** (asyncpg dialect + `ssl=require`, not `sslmode`):
   ```
   postgresql+asyncpg://USER:PASS@ep-xxx.ap-south-1.aws.neon.tech/neondb?ssl=require
   ```
   → this is your **DATABASE_URL**.

## 2. Azure OpenAI — confirm you have 🧑
You already run Azure OpenAI. The backend reads these from the environment (copy the values from your local `backend/.env`):
`LLM_PROVIDER`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, plus `STT_PROVIDER`/`OCR_PROVIDER`/`EMBEDDINGS_PROVIDER` and their `AZURE_*` keys.
→ **Set a budget alert:** Cost Management → Budgets → alert at $20 (and $50). Student credit expires ~12 months.

## 3. Cloudflare R2 — media storage 🧑
The S3-compatible storage adapter is built (private bucket + presigned URLs). Set `STORAGE_BACKEND=s3` so captured/uploaded media is durable (not on the container's ephemeral disk).
1. https://dash.cloudflare.com → R2 → Create bucket `constructo-media`.
2. R2 → Manage API Tokens → Create token (**Object Read & Write**). Note: **Access Key ID**, **Secret**, and the **S3 endpoint** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Add these to step 4's env (secrets for the keys):
   ```
   STORAGE_BACKEND=s3
   S3_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_BUCKET=constructo-media
   S3_REGION=auto
   S3_ACCESS_KEY_ID=secretref:s3-key
   S3_SECRET_ACCESS_KEY=secretref:s3-secret
   ```
4. *(For the homeowner direct-upload flow, R1)* add a **CORS rule** on the bucket allowing `PUT` from your app origin — R2 → bucket → Settings → CORS. Not needed for contractor capture (server-side upload).

## 4. Deploy to Azure Container Apps (~10 min) 🧑
From `constructo/backend`:
```sh
RG=constructo-rg
LOC=centralindia
APP=constructo-api

az group create -n $RG -l $LOC

# Builds the image FROM SOURCE in Azure (no local Docker needed) + deploys.
az containerapp up \
  --name $APP --resource-group $RG --location $LOC \
  --source . --ingress external --target-port 8000
```

Store secrets, then set env. **Env var names are UPPERCASE of the settings fields** (pydantic auto-maps `DATABASE_URL`→`database_url`, etc.):
```sh
az containerapp secret set -n $APP -g $RG --secrets \
  database-url="postgresql+asyncpg://...neon...?ssl=require" \
  jwt-secret="$(openssl rand -hex 32)" \
  aoai-key="<AZURE_OPENAI_API_KEY>"

az containerapp update -n $APP -g $RG \
  --min-replicas 1 --max-replicas 1 \
  --set-env-vars \
    DATABASE_URL=secretref:database-url \
    JWT_SECRET=secretref:jwt-secret \
    AZURE_OPENAI_API_KEY=secretref:aoai-key \
    LLM_PROVIDER=azure \
    STT_PROVIDER=azure \
    AZURE_OPENAI_ENDPOINT="https://<your>.openai.azure.com" \
    AZURE_OPENAI_DEPLOYMENT="<your-gpt-4o-mini-deployment>" \
    AZURE_OPENAI_API_VERSION="2024-10-21" \
    EXTRACTION_SYNC=true \
    ENABLE_SCHEDULER=true \
    CORS_ORIGINS='["https://<your-web-dashboard-if-any>"]'
```
> Tip: the simplest correct env is **"copy every key from your local `backend/.env` except `DATABASE_URL` and `REDIS_URL`"** (use your Neon URL for DATABASE_URL, omit REDIS_URL since `EXTRACTION_SYNC=true`). Put secret-ish values via `secret set` + `secretref:`.

Get the public URL:
```sh
az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv
# → constructo-api.<hash>.centralindia.azurecontainerapps.io  → use https://<that>
```

## 5. Seed + verify 🧑
```sh
# Seed demo data into Neon (run locally with the prod DATABASE_URL):
cd constructo/backend
DATABASE_URL="postgresql+asyncpg://...neon...?ssl=require" uv run python -m scripts.seed_demo

# Smoke-test every role against the deployed API:
BASE="https://<fqdn>" bash scripts/smoke_login.sh
curl https://<fqdn>/healthz   # → {"status":"ok"}
```

## 6. Point the apps at prod 🧑
- **Mobile:** `constructo/mobile/.env` → `EXPO_PUBLIC_API_BASE=https://<fqdn>` then `npx expo start -c` (or `eas build` for an APK).
- **Web dashboard:** set its API base + add its origin to `CORS_ORIGINS`.

---

## Gotchas
- **Neon direct vs pooled:** the pilot uses the **direct** endpoint (no pgbouncer). If you later hit connection limits, switch to the **pooled** endpoint *and* disable the asyncpg statement cache (1-line code change — ask).
- **Scheduler:** `min=max=1` + `ENABLE_SCHEDULER=true` runs the 7am brief in-process. **If you ever scale past 1 replica, turn the scheduler OFF** (else duplicate briefs) and move sweeps to a cron hitting `/api/v1/admin/run-*`.
- **Media durability** — set `STORAGE_BACKEND=s3` (step 3) or captured photos sit on the container's ephemeral disk and vanish on restart. With `local` (the default) media is fine for dev but NOT for Container Apps.
- **Cost:** 1 small always-on replica + Neon free + R2 free ≈ a few $/mo of Azure credit. AI inference is the main draw — that's the point of putting only AI on Azure.
