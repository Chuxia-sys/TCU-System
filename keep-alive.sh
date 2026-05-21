#!/bin/bash
# Persistent server keeper - restarts Next.js dev server if it dies
cd /home/z/my-project

while true; do
  # Check if server is responding
  if ! curl -s --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
    echo "[$(date -Iseconds)] Server not responding, starting..." >> /home/z/my-project/dev.log
    # Kill any leftover processes
    pkill -f "next dev" 2>/dev/null
    sleep 2
    # Start with setsid to create new process group
    setsid node node_modules/.bin/next dev -p 3000 --turbopack >> /home/z/my-project/dev.log 2>&1 &
    echo "[$(date -Iseconds)] Server started" >> /home/z/my-project/dev.log
    # Wait for it to be ready
    for i in $(seq 1 20); do
      if curl -s --max-time 3 http://localhost:3000/ > /dev/null 2>&1; then
        echo "[$(date -Iseconds)] Server ready" >> /home/z/my-project/dev.log
        break
      fi
      sleep 3
    done
  fi
  sleep 5
done
