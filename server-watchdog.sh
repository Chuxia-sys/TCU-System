#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=512"
while true; do
  node node_modules/.bin/next dev -p 3000 -H 0.0.0.0
  echo "Server died, restarting in 5 seconds..." >> /home/z/my-project/dev.log
  sleep 5
done
