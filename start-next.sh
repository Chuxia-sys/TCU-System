#!/bin/bash
# Robust auto-restart script for Next.js dev server
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

LOG="/home/z/my-project/dev.log"
PID_FILE="/home/z/my-project/.dev-server-pid"

echo "[$(date -Iseconds)] Starting Next.js dev server with auto-restart..." > "$LOG"

while true; do
  echo "[$(date -Iseconds)] Starting server..." >> "$LOG"
  node --max-old-space-size=4096 node_modules/.bin/next dev -p 3000 --turbopack >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[$(date -Iseconds)] Server exited with code $EXIT_CODE, restarting in 3s..." >> "$LOG"
  sleep 3
done
