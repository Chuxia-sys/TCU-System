#!/bin/bash
# Next.js Dev Server Supervisor
# Restarts the server automatically when it crashes

cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  echo "[$(date -Iseconds)] Starting Next.js..." >> /home/z/my-project/dev.log
  node --max-old-space-size=4096 node_modules/.bin/next dev -p 3000 --turbopack >> /home/z/my-project/dev.log 2>&1
  EXIT=$?
  echo "[$(date -Iseconds)] Server exited ($EXIT). Restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
