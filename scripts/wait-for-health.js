// Simple health poller that uses GET (not HEAD) to avoid 405 responses
// Usage: node scripts/wait-for-health.js [url] [timeout_ms]
const url = process.argv[2] || 'http://127.0.0.1:8000/health';
const timeout = parseInt(process.argv[3], 10) || 60000;
const interval = 500;

const start = Date.now();

async function poll() {
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        console.log(`Backend healthy (${url})`);
        process.exit(0);
      }
      console.log(`Waiting for backend: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.log(`Waiting for backend: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  console.error(`Timed out waiting for backend health at ${url}`);
  process.exit(1);
}

poll();
