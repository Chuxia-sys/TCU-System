import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

function startServer() {
  console.log(`[${new Date().toISOString()}] Starting Next.js dev server...`);
  
  const child = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000'], {
    cwd: '/home/z/my-project',
    stdio: 'inherit',
    env: { ...process.env },
  });
  
  writeFileSync('/tmp/next-dev-pid.txt', String(child.pid));
  
  child.on('exit', (code, signal) => {
    console.log(`[${new Date().toISOString()}] Server exited with code=${code} signal=${signal}`);
    setTimeout(startServer, 3000);
  });
}

startServer();
