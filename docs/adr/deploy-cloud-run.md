# Deploying screener-backend to Google Cloud Run

Single Docker image, two Cloud Run deployments:
- **Cloud Run Service**: always-on FastAPI API (the Next.js proxy target)
- **Cloud Run Job**: nightly pipeline triggered by Cloud Scheduler

## Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- GCP project with billing enabled, linked to your Firebase project
- Firebase project ID (same as GCP project ID)

Set these once in your terminal session:

```bash
export PROJECT_ID="your-firebase-project-id"
export REGION="asia-south1"
```

`asia-south1` (Mumbai) is recommended for lowest latency to NSE data
and Kolkata users. Change if your Firestore is in a different region.

---

## 1. Enable required APIs

```bash
gcloud services enable \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudbuild.googleapis.com \
    --project=$PROJECT_ID
```

## 2. Create Artifact Registry repository

```bash
gcloud artifacts repositories create screener-repo \
    --repository-format=docker \
    --location=$REGION \
    --description="Screener backend container images" \
    --project=$PROJECT_ID
```

## 3. Build and push the image

Run from the `screener-backend/` directory:

```bash
cd screener-backend

gcloud builds submit \
    --tag $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --project=$PROJECT_ID \
    .
```

This builds in Google Cloud Build (no local Docker needed). Takes 2-4
minutes on first run, under a minute on subsequent builds with layer
cache.

## 4. Deploy the Cloud Run Service (FastAPI API)

```bash
gcloud run deploy screener-api \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --set-env-vars USE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 2 \
    --project=$PROJECT_ID
```

The endpoint is publicly reachable but the URL is not indexed or
linked anywhere. The Next.js proxy verifies Firebase Auth before
forwarding, so unauthorised users never reach it through your app.
The residual risk is someone discovering the raw Cloud Run URL and
hitting the API directly (read-only screener data + watchlist CRUD).
Acceptable for a single-user private tool.

After deploy, note the Service URL printed (e.g.
`https://screener-api-xxxxx-xx.a.run.app`). You need this for §8.

## 5. Deploy the Cloud Run Job (nightly pipeline)

```bash
gcloud run jobs create screener-nightly \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --region $REGION \
    --command python \
    --args="-m","app.main_job" \
    --set-env-vars USE_FIRESTORE=true,GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
    --memory 1Gi \
    --cpu 1 \
    --task-timeout 900 \
    --max-retries 1 \
    --project=$PROJECT_ID
```

`--date` defaults to today IST when omitted. For a manual backfill or
market-holiday skip:

```bash
# Manual run for a specific date
gcloud run jobs execute screener-nightly \
    --region $REGION \
    --args="-m","app.main_job","--date","2026-07-11" \
    --project=$PROJECT_ID

# Record a skipped day (NSE holiday)
gcloud run jobs execute screener-nightly \
    --region $REGION \
    --args="-m","app.main_job","--skipped","--date","2026-08-15" \
    --project=$PROJECT_ID
```

## 6. Schedule the nightly run (Cloud Scheduler)

```bash
# Get the service account email for the scheduler
SA_EMAIL=$(gcloud iam service-accounts list \
    --filter="displayName:Compute Engine default" \
    --format="value(email)" \
    --project=$PROJECT_ID)

gcloud scheduler jobs create http screener-nightly-trigger \
    --schedule="0 23 * * 1-5" \
    --time-zone="Asia/Kolkata" \
    --location=$REGION \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/screener-nightly:run" \
    --http-method=POST \
    --oauth-service-account-email=$SA_EMAIL \
    --project=$PROJECT_ID
```

This fires at 23:00 IST, Monday through Friday. NSE holidays still
trigger the job (it processes data and finds nothing changed, which is
fine). Use `--skipped` for genuine data-gap days where you want an
explicit record.

## 7. IAM permissions

Cloud Run needs Firestore read/write access:

```bash
SA_EMAIL=$(gcloud iam service-accounts list \
    --filter="displayName:Compute Engine default" \
    --format="value(email)" \
    --project=$PROJECT_ID)

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/datastore.user"
```

This grants the default Compute Engine service account (used by both
the Cloud Run Service and Job) permission to read and write Firestore
documents. No other IAM changes are needed with the
`--allow-unauthenticated` setup.

## 8. Wire the Next.js frontend

Add the Cloud Run Service URL to your Next.js environment:

```env
# Vercel dashboard → Environment Variables, or .env.local
SCREENER_API_URL=https://screener-api-xxxxx-xx.a.run.app/api
```

The trailing `/api` is required (matches the FastAPI router prefix).
No proxy code changes needed.

---

## Rebuild and redeploy workflow

After code changes, repeat §3 (build) then update the relevant
deployment:

```bash
# Rebuild
cd screener-backend
gcloud builds submit \
    --tag $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --project=$PROJECT_ID .

# Update the API service
gcloud run services update screener-api \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --region $REGION \
    --project=$PROJECT_ID

# Update the job (uses new image on next execution automatically
# if tagged :latest, but explicit update is cleaner)
gcloud run jobs update screener-nightly \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/screener-repo/screener:latest \
    --region $REGION \
    --project=$PROJECT_ID
```
