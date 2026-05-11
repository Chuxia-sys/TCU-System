#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js..." >> /home/z/my-project/dev.log
  NODE_OPTIONS=--max-old-space-size=512 npx next dev -p 3000 -H 0.0.0.0 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Next.js exited with code $?, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
