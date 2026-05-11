import subprocess
import time
import os
import signal
import sys

log_file = open('/home/z/my-project/dev.log', 'a')

def start_server():
    env = os.environ.copy()
    env['NODE_OPTIONS'] = '--max-old-space-size=512'
    
    proc = subprocess.Popen(
        ['node', 'node_modules/.bin/next', 'dev', '-p', '3000'],
        cwd='/home/z/my-project',
        env=env,
        stdout=log_file,
        stderr=log_file,
        preexec_fn=os.setsid
    )
    return proc

print(f"[Python Supervisor] Starting Next.js server...", flush=True)
proc = start_server()
print(f"[Python Supervisor] Server PID: {proc.pid}", flush=True)

# Keep running and restart if needed
while True:
    ret = proc.poll()
    if ret is not None:
        print(f"[Python Supervisor] Server exited with code {ret}, restarting in 5s...", flush=True)
        time.sleep(5)
        proc = start_server()
        print(f"[Python Supervisor] Restarted with PID: {proc.pid}", flush=True)
    time.sleep(5)
