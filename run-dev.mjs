import { spawn } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';

const LOG_FILE = '/home/z/my-project/dev.log';
const PID_FILE = '/home/z/my-project/.dev-server-pid';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG_FILE, line); } catch {}
  console.log(line.trimEnd());
}

function startServer() {
  log('Starting Next.js dev server...');
  
  const child = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000', '--turbopack'], {
    cwd: '/home/z/my-project',
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
  });
  
  writeFileSync(PID_FILE, String(child.pid));
  log(`Server PID: ${child.pid}`);
  
  child.on('exit', (code, signal) => {
    log(`Server exited with code=${code} signal=${signal}`);
    // Auto-restart after 3 seconds
    setTimeout(startServer, 3000);
  });
  
  child.on('error', (err) => {
    log(`Server spawn error: ${err.message}`);
    setTimeout(startServer, 5000);
  });
}

// Truncate log on fresh start
try { writeFileSync(LOG_FILE, ''); } catch {}
startServer();
