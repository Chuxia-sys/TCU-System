#!/usr/bin/env python3
"""
Next.js Dev Server Watchdog
Monitors the Next.js dev server and automatically restarts it when it crashes.
Runs as a completely separate process to avoid being killed along with the server.
"""

import subprocess
import time
import os
import sys
import signal
import threading

PROJECT_DIR = '/home/z/my-project'
DEV_LOG = os.path.join(PROJECT_DIR, 'dev.log')
PID_FILE = os.path.join(PROJECT_DIR, '.dev-server-pid')
HEALTH_URL = 'http://localhost:3000/'
CHECK_INTERVAL = 5  # seconds between health checks
RESTART_DELAY = 3   # seconds to wait before restarting

def log(msg):
    ts = time.strftime('%Y-%m-%dT%H:%M:%S')
    line = f"[{ts}] [watchdog] {msg}\n"
    print(line, end='', flush=True)
    try:
        with open(DEV_LOG, 'a') as f:
            f.write(line)
    except:
        pass

def is_server_healthy():
    """Check if the Next.js server is responding."""
    try:
        result = subprocess.run(
            ['curl', '-s', '--max-time', '5', '-o', '/dev/null', '-w', '%{http_code}', HEALTH_URL],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == '200'
    except:
        return False

def start_server():
    """Start the Next.js dev server."""
    # Kill any existing server
    subprocess.run(['pkill', '-f', 'next dev'], capture_output=True, timeout=5)
    time.sleep(2)
    
    # Clean build cache if it exists (helps with memory issues)
    # Don't clean on every restart - only on first start
    
    env = os.environ.copy()
    env['NODE_OPTIONS'] = '--max-old-space-size=4096'
    
    # Truncate log on fresh start
    try:
        with open(DEV_LOG, 'w') as f:
            f.write(f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] [watchdog] Starting Next.js dev server...\n")
    except:
        pass
    
    proc = subprocess.Popen(
        ['node', '--max-old-space-size=4096', 'node_modules/.bin/next', 'dev', '-p', '3000', '--turbopack'],
        cwd=PROJECT_DIR,
        env=env,
        stdout=open(DEV_LOG, 'a'),
        stderr=subprocess.STDOUT,
        start_new_session=True,  # Create new process group
    )
    
    # Write PID file
    try:
        with open(PID_FILE, 'w') as f:
            f.write(str(proc.pid))
    except:
        pass
    
    log(f"Server started with PID {proc.pid}")
    return proc

def wait_for_server(timeout=60):
    """Wait for the server to become healthy."""
    start = time.time()
    while time.time() - start < timeout:
        if is_server_healthy():
            log("Server is healthy and responding")
            return True
        time.sleep(3)
    log(f"Server failed to become healthy within {timeout}s")
    return False

def main():
    log("Watchdog starting...")
    
    # Handle signals gracefully
    def handle_signal(signum, frame):
        log(f"Received signal {signum}, shutting down...")
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    # Start the server
    proc = start_server()
    
    # Wait for it to be healthy
    if not wait_for_server():
        log("Initial server start failed, retrying...")
    
    # Monitor loop
    crash_count = 0
    last_crash_time = 0
    
    while True:
        try:
            # Check if server process is still running
            if proc.poll() is not None:
                exit_code = proc.returncode
                log(f"Server process exited with code {exit_code}")
                
                # Rate limit restarts (don't restart more than once per 10s)
                now = time.time()
                if now - last_crash_time < 10:
                    wait_time = 10 - (now - last_crash_time)
                    log(f"Rate limiting restart, waiting {wait_time:.0f}s...")
                    time.sleep(wait_time)
                
                last_crash_time = time.time()
                crash_count += 1
                
                # If crashing too frequently, wait longer
                if crash_count > 5:
                    wait = min(30, crash_count * 5)
                    log(f"Too many crashes ({crash_count}), waiting {wait}s before restart...")
                    time.sleep(wait)
                
                # Restart
                proc = start_server()
                wait_for_server()
                continue
            
            # Check if server is responding
            if not is_server_healthy():
                log("Server not responding, checking process...")
                if proc.poll() is not None:
                    log("Server process is dead")
                    proc = start_server()
                    wait_for_server()
            
            time.sleep(CHECK_INTERVAL)
            
        except Exception as e:
            log(f"Watchdog error: {e}")
            time.sleep(5)

if __name__ == '__main__':
    main()
