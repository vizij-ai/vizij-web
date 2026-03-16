#!/bin/bash
# Launch tutorial-fullscreen-face in fullscreen Firefox on Raspberry Pi

set -e

# Ensure pnpm/node are on PATH (needed when run from autostart/desktop)
export PATH="/home/touchpi/.local/share/pnpm:$PATH"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:5173?autoplay"

echo "Killing existing Firefox and pnpm instances..."
killall firefox 2>/dev/null || true
killall pnpm 2>/dev/null || true
killall node 2>/dev/null || true
sleep 1

echo "Starting dev server..."
cd "$REPO_DIR"
pnpm run dev:tutorial-fullscreen-face -- --host &
DEV_PID=$!

echo "Waiting for dev server to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5173; then
    echo "Dev server is up."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Timed out waiting for dev server."
    exit 1
  fi
  sleep 1
done

echo "Launching Firefox..."
firefox "$URL" &
sleep 10

echo "Switching to fullscreen..."
wtype -k F11

echo "Done. Dev server PID: $DEV_PID"
wait $DEV_PID
