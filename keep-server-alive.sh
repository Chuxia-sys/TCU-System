#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=768"
# Start the Next.js server
node node_modules/.bin/next dev -p 3000 -H 0.0.0.0 &
SERVER_PID=$!
echo "Next.js server started with PID $SERVER_PID"

# Keep this script running
while kill -0 $SERVER_PID 2>/dev/null; do
  sleep 5
done
echo "Server process died"
