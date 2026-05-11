#!/bin/bash
cd /home/z/my-project

# Start notification service
cd mini-services/notification-service
setsid bun --hot index.ts >> /home/z/my-project/notif.log 2>&1 &
cd /home/z/my-project

# Start Next.js
setsid bash -c 'NODE_OPTIONS=--max-old-space-size=512 node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' >> /home/z/my-project/dev.log 2>&1 &

echo "Services started"
