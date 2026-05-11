#!/bin/bash
cd /home/z/my-project
while true; do
  # Kill any existing next process
  pkill -f "next dev" 2>/dev/null
  sleep 2
  
  # Start the server
  bun run dev >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "Server exited with code $EXIT_CODE at $(date), restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
