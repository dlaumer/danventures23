#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

cleanup() {
  echo
  echo "Stopping dev servers..."
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting frontend..."
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

echo "Starting backend..."
(
  cd "$BACKEND_DIR"
  source .venv/Scripts/activate
  uvicorn main:app --reload
) &
BACKEND_PID=$!

echo
echo "Frontend PID: $FRONTEND_PID"
echo "Backend PID:  $BACKEND_PID"
echo "Press Ctrl+C to stop both servers."
echo

wait "$FRONTEND_PID" "$BACKEND_PID"
