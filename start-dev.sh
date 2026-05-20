#!/bin/bash
cd /home/z/my-project
echo $$ > /tmp/dev-server-runner.pid

while true; do
  echo "[$(date)] Starting Next.js dev server..." >> /home/z/my-project/dev.log
  node node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE" >> /home/z/my-project/dev.log
  if [ $EXIT_CODE -ne 0 ]; then
    echo "[$(date)] Restarting in 5 seconds..." >> /home/z/my-project/dev.log
    sleep 5
  else
    break
  fi
done
