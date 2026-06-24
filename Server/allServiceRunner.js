const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname);

const SERVICES = [
  {
    name: "API_Gateway",
    color: "\x1b[35m",
    cwd: path.join(ROOT, "API_Gateway"),
  },
  {
    name: "Auth_Service",
    color: "\x1b[33m",
    cwd: path.join(ROOT, "Auth_Service"),
  },
  {
    name: "User_Service",
    color: "\x1b[36m",
    cwd: path.join(ROOT, "User_Service"),
  },
  {
    name: "Video_Service",
    color: "\x1b[32m",
    cwd: path.join(ROOT, "Video_Service"),
  },
  {
    name: "Transcoding_Service",
    color: "\x1b[31m",
    cwd: path.join(ROOT, "Transcoding_Service"),
  },
  {
    name: "Streaming_Service",
    color: "\x1b[34m",
    cwd: path.join(ROOT, "Streaming_Service"),
  },
  {
    name: "Search_Service",
    color: "\x1b[93m",
    cwd: path.join(ROOT, "Search_Service"),
  },
  {
    name: "Recommendation_Service",
    color: "\x1b[95m",
    cwd: path.join(ROOT, "Recommendation_Service"),
  },
  {
    name: "Comment_Service",
    color: "\x1b[96m",
    cwd: path.join(ROOT, "Comment_Service"),
  },
  {
    name: "Notification_Service",
    color: "\x1b[92m",
    cwd: path.join(ROOT, "Notification_Service"),
  },
  {
    name: "Analytics_Service",
    color: "\x1b[91m",
    cwd: path.join(ROOT, "Analytics_Service"),
  },
];

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(color, name, msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const lines = msg.toString().trim().split('\n');
  lines.forEach(line => {
    if (line.trim() === '') return;
    console.log(`${DIM}${time}${RESET} ${color}${BOLD}[${name}]${RESET} ${line}`);
  });
}

function logSystem(msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${DIM}${time}${RESET} \x1b[97m${BOLD}[RUNNER]${RESET} ${msg}`);
}

function printBanner() {
  console.log('\n');
  console.log('\x1b[35m╔══════════════════════════════════════════════════════╗' + RESET);
  console.log('\x1b[35m║                                                      ║' + RESET);
  console.log('\x1b[35m║        YT CLONE  —  All Services Runner              ║' + RESET);
  console.log('\x1b[35m║        11 Microservices  ·  Built by Scorpion        ║' + RESET);
  console.log('\x1b[35m║                                                      ║' + RESET);
  console.log('\x1b[35m╚══════════════════════════════════════════════════════╝' + RESET);
  console.log('\n');
}

function printStatus() {
  logSystem('Services queued for startup:\n');
  SERVICES.forEach(({ name, color, cwd }) => {
    console.log(`   ${color}${BOLD}●${RESET}  ${color}${name}${RESET}`);
    console.log(`      ${DIM}${cwd}${RESET}`);
  });
  console.log('\n');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const runningProcesses = [];

function shutdown() {
  console.log('\n');
  logSystem('Shutting down all services...');
  runningProcesses.forEach(proc => {
    try { proc.kill('SIGTERM'); } catch (_) { }
  });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  printBanner();
  printStatus();

  // ── Phase 1: npm install each service sequentially ───────────────────────
  logSystem('Phase 1 — Installing dependencies...\n');

  // Phase 1 — install + ensure dev script exists
  for (const service of SERVICES) {
    const { name, color, cwd } = service;

    logSystem(`Setting up ${color}${BOLD}${name}${RESET}...`);

    // Step 1: set dev script
    await new Promise((resolve) => {
      const setter = spawn('npm', ['pkg', 'set', 'scripts.dev=nodemon server.js'], { cwd, shell: true });
      setter.on('close', resolve);
      setter.on('error', resolve);
    });

    // Step 2: install nodemon + deps
    await new Promise((resolve) => {
      const installer = spawn('npm', ['install', 'nodemon', '--save-dev'], { cwd, shell: true });

      installer.stdout.on('data', (data) => log(color, name, data));
      installer.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('ERR!') || msg.includes('error')) {
          log(color, name, `[ERR] ${msg}`);
        }
      });

      installer.on('close', (code) => {
        if (code === 0) logSystem(`${color}${BOLD}${name}${RESET} ✓ ready`);
        else logSystem(`${color}${BOLD}${name}${RESET} ✗ failed (exit ${code})`);
        resolve();
      });

      installer.on('error', (err) => {
        logSystem(`${color}${BOLD}${name}${RESET} error: ${err.message}`);
        resolve();
      });
    });
  }

  // ── Phase 2: start services sequentially in dependency order ──────────────
  console.log('\n');
  logSystem('Phase 2 — Starting all services...\n');

  async function startService(service) {
    const { name, color, cwd } = service;

    return new Promise((resolve) => {
      const dev = spawn('npm', ['run', 'dev'], { cwd, shell: true });
      runningProcesses.push(dev);

      let started = false;
      const markStarted = (data) => {
        if (started) return;
        const msg = data.toString().trim();
        if (msg === '') return;
        started = true;
        logSystem(`${color}${BOLD}${name}${RESET} ✓ started`);
        resolve();
      };

      dev.stdout.on('data', (data) => {
        markStarted(data);
        log(color, name, data);
      });
      dev.stderr.on('data', (data) => {
        markStarted(data);
        log(color, name, data);
      });

      dev.on('close', (code) => {
        logSystem(`${color}${BOLD}${name}${RESET} exited with code ${code}`);
      });

      dev.on('error', (err) => {
        logSystem(`${color}${BOLD}${name}${RESET} failed to start: ${err.message}`);
        if (!started) {
          started = true;
          resolve();
        }
      });

      setTimeout(() => {
        if (!started) {
          started = true;
          logSystem(`${color}${BOLD}${name}${RESET} started (timeout)`);
          resolve();
        }
      }, 1500);
    });
  }

  for (const service of SERVICES) {
    await startService(service);
  }

  logSystem('All services running. Streaming logs below...\n');
  console.log('\x1b[35m' + '─'.repeat(56) + RESET + '\n');
}

boot();