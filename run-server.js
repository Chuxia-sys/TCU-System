const { spawn } = require('child_process');
const path = require('path');

const projectDir = '/home/z/my-project';
const logFile = require('fs').createWriteStream(path.join(projectDir, 'dev.log'), { flags: 'a' });

console.log('[run-server.js] Starting Next.js dev server...');

const child = spawn('node', [path.join(projectDir, 'node_modules/.bin/next'), 'dev', '-p', '3000'], {
  cwd: projectDir,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
  stdio: ['ignore', logFile, logFile],
  detached: true
});

child.unref();

console.log('[run-server.js] Server PID:', child.pid);
console.log('[run-server.js] Server started in detached mode');

// Keep this script alive to prevent process reaping
setInterval(() => {
  // Just keep the event loop running
}, 60000);
