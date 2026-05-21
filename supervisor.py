#!/usr/bin/env python3
"""Next.js Dev Server Supervisor - restarts the server when it crashes."""
import subprocess
import time
import os
import threading

os.chdir('/home/z/my-project')
env = os.environ.copy()
env['NODE_OPTIONS'] = '--max-old-space-size=4096'

def write_pid(pid):
    with open('/home/z/my-project/.dev-server-pid', 'w') as f:
        f.write(str(pid))

def main():
    while True:
        ts = time.strftime('%Y-%m-%dT%H:%M:%S')
        print(f"[{ts}] Starting Next.js dev server...", flush=True)
        
        proc = subprocess.Popen(
            ['node', '--max-old-space-size=4096', 'node_modules/.bin/next', 'dev', '-p', '3000', '--turbopack'],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        
        write_pid(proc.pid)
        ts = time.strftime('%Y-%m-%dT%H:%M:%S')
        print(f"[{ts}] Server PID: {proc.pid}", flush=True)
        
        # Stream output to log file
        log = open('/home/z/my-project/dev.log', 'a')
        
        def read_output():
            for line in proc.stdout:
                line = line.decode('utf-8', errors='replace')
                log.write(line)
                log.flush()
        
        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()
        
        # Wait for process to exit
        retcode = proc.wait()
        log.close()
        
        ts = time.strftime('%Y-%m-%dT%H:%M:%S')
        print(f"[{ts}] Server exited with code {retcode}. Restarting in 3s...", flush=True)
        time.sleep(3)

if __name__ == '__main__':
    main()
