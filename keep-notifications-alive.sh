#!/bin/bash
cd /home/z/my-project/mini-services/notification-service
while true; do
  bun --hot index.ts
  echo "[$(date)] Notification service died, restarting in 2s..." >> log.txt
  sleep 2
done
