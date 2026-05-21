#!/bin/bash
cd /home/z/my-project
while true; do
  NODE_OPTIONS="--max-old-space-size=4096" node --max-old-space-size=4096 node_modules/.bin/next dev -p 3000 --turbopack 2>&1
  sleep 3
done
