#!/bin/bash
# TCU Scheduling System - Server Supervisor
# Keeps the Next.js dev server running persistently

cd /home/z/my-project

LOG_FILE="/home/z/my-project/dev.log"

echo "[$(date)] Server supervisor starting..." >> "$LOG_FILE"

while true; do
  # Kill any existing next processes
  pkill -f "next dev" 2>/dev/null
  sleep 2

  # Start the server
  echo "[$(date)] Starting Next.js dev server..." >> "$LOG_FILE"
  NODE_OPTIONS="--max-old-space-size=512" node node_modules/.bin/next dev -p 3000 >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 5s..." >> "$LOG_FILE"
  sleep 5
done
