#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="193.203.161.48"
VPS_USER="root"
REMOTE_DIR="/opt/softrate-workspace"

echo "Syncing PeopleSoft HRMS .env to VPS ($VPS_USER@$VPS_HOST)..."

# 1. Copy .env file to VPS
scp -o StrictHostKeyChecking=accept-new \
  "services/hrms Multi-terent/.env" \
  "$VPS_USER@$VPS_HOST:$REMOTE_DIR/services/hrms Multi-terent/.env"

# 2. Recreate/restart hrms-api container to load the updated env
echo "Restarting hrms-api container on VPS..."
ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" \
  "cd \"$REMOTE_DIR\" && docker compose up -d --force-recreate hrms-api"

echo "PeopleSoft HRMS .env updated and service restarted successfully! ✅"
