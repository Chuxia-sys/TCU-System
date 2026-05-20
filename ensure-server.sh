#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

# Kill any existing server
pkill -f "next dev" 2>/dev/null
sleep 2
rm -rf .next

# Start the server
nohup node --max-old-space-size=4096 node_modules/.bin/next dev -p 3000 --turbopack >> /home/z/my-project/dev.log 2>&1 &
disown

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -s --max-time 3 http://localhost:3000/ > /dev/null 2>&1; then
    echo "[$(date -Iseconds)] Server is ready" >> /home/z/my-project/dev.log
    exit 0
  fi
  sleep 2
done

echo "[$(date -Iseconds)] Server failed to start" >> /home/z/my-project/dev.log
exit 1
