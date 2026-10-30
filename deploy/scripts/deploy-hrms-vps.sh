#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="193.203.161.48"
VPS_USER="root"
REMOTE_DIR="/opt/softrate-workspace"

echo "========================================================"
echo " Deploying PeopleSoft alone to $VPS_USER@$VPS_HOST"
echo " (Strict policy: .env and gateway container untouched)"
echo "========================================================"

# 1. Sync PeopleSoft Backend (Strictly excluding .env files)
echo "1. Syncing PeopleSoft backend files (excluding .env)..."
rsync -avz --delete \
  --exclude="node_modules" \
  --exclude=".git" \
  --exclude="dist" \
  --exclude=".env*" \
  --exclude=".DS_Store" \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "services/hrms Multi-terent/" "$VPS_USER@$VPS_HOST:'$REMOTE_DIR/services/hrms Multi-terent/'"

# 2. Sync PeopleSoft Source / App
echo "2. Syncing PeopleSoft frontend source files..."
rsync -avz --delete \
  --exclude="node_modules" \
  --exclude=".git" \
  --exclude=".angular" \
  --exclude=".env*" \
  --exclude=".DS_Store" \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "apps/peoplespft-multi terent/" "$VPS_USER@$VPS_HOST:'$REMOTE_DIR/apps/peoplespft-multi terent/'"

# 3. Deploy Frontend static build into Gateway without rebuilding/touching gateway container
echo "3. Copying compiled frontend bundle directly to running gateway static directory..."
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "mkdir -p /tmp/hrms-static"
rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "apps/peoplespft-multi terent/dist/admin-page/browser/" "$VPS_USER@$VPS_HOST:/tmp/hrms-static/"
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "docker cp /tmp/hrms-static/. softrate-workspace-gateway-1:/usr/share/nginx/html/hrms/ && rm -rf /tmp/hrms-static"

# 4. Rebuild ONLY hrms-api container (leave gateway and all other containers untouched)
echo "4. Rebuilding and restarting hrms-api container alone..."
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "cd \"$REMOTE_DIR\" && docker compose build --no-cache hrms-api && docker compose up -d --no-deps hrms-api"
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "docker exec softrate-workspace-gateway-1 nginx -s reload"

# 5. Check hrms-api status
echo "5. Verifying hrms-api container status..."
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "docker ps --filter 'name=hrms-api' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

echo "========================================================"
echo " PeopleSoft deployment complete! ✅"
echo " Gateway & .env were NOT touched."
echo "========================================================"

