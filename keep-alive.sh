#!/bin/bash
# Check if next dev is already running
if ! curl -s --max-time 3 -o /dev/null http://localhost:3000 2>/dev/null; then
  cd /home/z/my-project
  # Kill any stale processes
  pkill -f "next dev" 2>/dev/null
  sleep 2
  # Start fresh
  nohup bun run dev > /home/z/my-project/dev.log 2>&1 &
fi
