#!/usr/bin/env bash
# Start the full Auravox app for local development:
#   1. Backend services via scripts/start_services_dev.sh (uvicorn, arq,
#      ari_manager, campaign_orchestrator + health check)
#   2. Next.js UI on port 3000 (Ctrl-C stops the UI; backend keeps running,
#      stop it with scripts/stop_services.sh)
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$BASE_DIR/scripts/start_services_dev.sh"

cd "$BASE_DIR/ui"
echo
echo "Starting UI at http://localhost:3000 ..."
exec npm run dev -- --hostname 0.0.0.0
