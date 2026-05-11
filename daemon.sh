#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=512"

# Start the server in a new process group
setsid node node_modules/.bin/next dev -p 3000 -H 0.0.0.0 &
SERVER_PID=$!

# Write PID file
echo $SERVER_PID > /tmp/next-server.pid

# Wait indefinitely
wait $SERVER_PID
