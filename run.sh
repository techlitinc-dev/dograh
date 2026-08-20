#!/usr/bin/env bash
# run.sh — start the complete VoxCRM stack for local development.
#
#   1. Docker dependencies (postgres, redis, minio) via docker-compose-local.yaml
#   2. Alembic migrations (DB brought to head)
#   3. Backend services via scripts/start_services_dev.sh
#      (uvicorn :8000 + arq worker + campaign orchestrator + ari_manager)
#   4. Next.js UI dev server (port 3000, auto-increments if busy; override
#      with UI_PORT=xxxx ./run.sh)
#
# Logs: logs/<timestamp>/ (backend services) and logs/ui-dev.log (UI).
# Stop the backend with scripts/stop_services.sh; stop the UI with
# "kill $(cat run/ui.pid)".
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

COMPOSE_FILE="docker-compose-local.yaml"
UI_LOG="$BASE_DIR/logs/ui-dev.log"
UI_PID_FILE="$BASE_DIR/run/ui.pid"

echo "==> [1/4] Starting docker dependencies (postgres, redis, minio)..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis minio

echo "==> Waiting for postgres and redis to accept connections..."
for attempt in $(seq 1 30); do
  pg_ok=$(docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -q 2>/dev/null && echo yes || true)
  redis_ok=$(docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG && echo yes || true)
  if [[ -n "$pg_ok" && -n "$redis_ok" ]]; then
    echo "    postgres and redis are up."
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "    ERROR: docker dependencies did not become healthy." >&2
    exit 1
  fi
  sleep 2
done

echo "==> [2/4] Running database migrations..."
./scripts/migrate.sh

echo "==> [3/4] Starting backend services (uvicorn, arq worker, campaign orchestrator, ari_manager)..."
./scripts/start_services_dev.sh

echo "==> [4/4] Starting UI dev server..."
if [[ -f "$UI_PID_FILE" ]] && kill -0 "$(cat "$UI_PID_FILE")" 2>/dev/null; then
  echo "    UI already running (pid $(cat "$UI_PID_FILE"))."
else
  if [[ ! -d ui/node_modules ]]; then
    echo "    ui/node_modules missing — running npm install first..."
    (cd ui && npm install)
  fi
  mkdir -p logs run
  # UI_PORT is honored by ui/scripts/dev-server.mjs when set; otherwise
  # `next dev` binds 3000 and auto-increments if busy.
  nohup npm --prefix ui run dev > "$UI_LOG" 2>&1 &
  echo $! > "$UI_PID_FILE"
  echo "    UI started (pid $(cat "$UI_PID_FILE")), log: $UI_LOG"
fi

echo "==> Waiting for the UI to come up..."
UI_URL=""
for attempt in $(seq 1 60); do
  UI_URL=$(grep -oE "http://localhost:[0-9]+" "$UI_LOG" 2>/dev/null | head -1 || true)
  if [[ -n "$UI_URL" ]] && curl -s -m 2 -o /dev/null "$UI_URL/auth/login"; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    echo "    ERROR: UI did not come up. Check: tail -f $UI_LOG" >&2
    exit 1
  fi
  sleep 2
done

echo ""
echo "VoxCRM is running:"
echo "  UI:      ${UI_URL:-http://localhost:3000}  (signup: /auth/signup)"
echo "  Backend: http://localhost:8000  (health: /api/v1/health)"
echo "  Logs:    logs/latest/ and $UI_LOG"
