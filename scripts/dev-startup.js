const { spawn } = require('child_process');
const os = require('os');

const pythonExecutable = os.platform() === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';

function spawnBackend() {
  const args = ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '0.0.0.0', '--port', '8000', '--app-dir', 'backend'];

  const child = spawn(pythonExecutable, args, { stdio: 'inherit' });

  child.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  // When using --reload, the reloader process may exit and restart worker processes frequently.
  // Treat an unexpected exit as a crash and attempt to respawn the backend after a short backoff.
  child.on('exit', (code, signal) => {
    console.error(`Backend process exited with code=${code} signal=${signal}`);
    // If we exited with a non-zero exit code, try to respawn after delay
    if ((code && code !== 0) || signal) {
      const delay = 2000;
      console.log(`Respawning backend in ${delay}ms...`);
      setTimeout(spawnBackend, delay);
    } else {
      // If exit code is zero, it's a graceful shutdown (e.g., parent sent SIGINT)
      console.log('Backend exited cleanly. If you want the dev orchestrator to stop, press CTRL+C.');
    }
  });

  return child;
}

async function waitForBackend({ url = 'http://127.0.0.1:8000/health', timeout = 60000, interval = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function spawnFrontend() {
  // Use npm run dev:frontend which uses vite
  const child = spawn('npm', ['run', 'dev:frontend'], { stdio: 'inherit', shell: true });
  child.on('error', (err) => {
    console.error('Failed to start frontend:', err);
  });
  child.on('exit', (code, signal) => {
    console.error(`Frontend process exited with code=${code} signal=${signal}`);
    // Don't exit the orchestrator — attempt to respawn the frontend after a short backoff
    const delay = 2000;
    console.log(`Respawning frontend in ${delay}ms...`);
    setTimeout(spawnFrontend, delay);
  });
  return child;
}

(async () => {
  console.log('Starting backend...');
  const backend = spawnBackend();

  console.log('Waiting for backend readiness (health)...');
  const ready = await waitForBackend();
  if (!ready) {
    console.error('Backend did not become healthy in time; check logs. Proceeding to start frontend anyway.');
  } else {
    console.log('Backend healthy — starting frontend');
  }

  const frontend = spawnFrontend();

  // Relay shutdown signals to children
  const shutdown = () => {
    try { backend.kill(); } catch (e) {}
    try { frontend.kill(); } catch (e) {}
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
// Log uncaught exceptions/rejections to help debugging, but don't let the orchestrator die silently
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in dev-startup:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in dev-startup:', reason);
});
})();