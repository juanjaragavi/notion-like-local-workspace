#!/usr/bin/env bash
# =============================================================================
# Deploy MCP Server to Google Cloud Run
#
# Usage:
#   ./scripts/deploy-mcp-cloudrun.sh [--project <id>] [--region <region>]
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Docker available (used by Cloud Build)
#   - Artifact Registry API enabled in the project
#
# After deployment, copy the printed Service URL and set it as MCP_SERVER_URL
# in your Vercel project environment variables.
# =============================================================================
set -euo pipefail

# ── Defaults (override via CLI flags or env vars) ───────────────────────────
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-absolute-brook-452020-d5}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_NAME="notion-mcp-server"
REPO_NAME="notion-workspace"
# Artifact Registry image path
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME"

# ── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_ID="$2"; shift 2 ;;
    --region)  REGION="$2";     shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

echo ""
echo "━━━ MCP Server → Cloud Run ━━━"
echo "  Project : $PROJECT_ID"
echo "  Region  : $REGION"
echo "  Service : $SERVICE_NAME"
echo "  Image   : $IMAGE"
echo ""

# ── Ensure Artifact Registry repository exists ───────────────────────────────
echo "▸ Ensuring Artifact Registry repository '${REPO_NAME}'..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --format="value(name)" 2>/dev/null \
|| gcloud artifacts repositories create "$REPO_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --repository-format=docker \
  --description="Notion Workspace container images"

# ── Build and push image via Cloud Build ─────────────────────────────────────
echo "▸ Building and pushing container image..."
gcloud builds submit ./mcp-server \
  --project="$PROJECT_ID" \
  --tag="$IMAGE" \
  --timeout=10m

# ── Deploy to Cloud Run ──────────────────────────────────────────────────────
echo "▸ Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --port=3100 \
  --set-env-vars="MCP_PORT=3100" \
  --timeout=60s

# ── Fetch the deployed URL ───────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="value(status.url)")

echo ""
echo "✓ MCP Server deployed successfully"
echo ""
echo "  Service URL : $SERVICE_URL"
echo ""
echo "  Next step — set in Vercel dashboard (Settings → Environment Variables):"
echo ""
echo "    MCP_SERVER_URL=$SERVICE_URL"
echo ""
echo "  To test:"
echo "    curl -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\" \\"
echo "         $SERVICE_URL/health"
echo ""
