/**
 * SMART SIGNAL — Express REST API Server
 *
 * Endpoints:
 *  GET  /api/health           Server health check
 *  GET  /api/traffic-config   Traffic light timing configuration
 *  POST /api/traffic-events   Log a state transition event
 *  POST /api/pedestrian-request  Pedestrian crossing request
 *  GET  /api/traffic-events   Retrieve recent events
 *
 * Events are stored in memory and persisted to data/traffic-events.json.
 */
import express  from 'express';
import cors     from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = 3001;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger (non-essential but helpful for demonstration)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Event Store ───────────────────────────────────────────────────────────
const DATA_FILE = join(__dirname, '..', 'data', 'traffic-events.json');
let trafficEvents = [];

// Load existing events from disk
if (existsSync(DATA_FILE)) {
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    trafficEvents = JSON.parse(raw);
    if (!Array.isArray(trafficEvents)) trafficEvents = [];
    console.log(`[Server] Loaded ${trafficEvents.length} existing event(s) from disk.`);
  } catch {
    trafficEvents = [];
  }
}

function persistEvents() {
  try {
    // Keep only the most recent 100 events
    if (trafficEvents.length > 100) trafficEvents = trafficEvents.slice(-100);
    writeFileSync(DATA_FILE, JSON.stringify(trafficEvents, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Server] Failed to persist events:', err.message);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Returns server status.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    events:    trafficEvents.length
  });
});

/**
 * GET /api/traffic-config
 * Returns the traffic light timing configuration in milliseconds.
 * In a production system this could be loaded from a database or env vars.
 */
app.get('/api/traffic-config', (_req, res) => {
  res.json({
    greenDuration:  5000,
    yellowDuration: 2000,
    redDuration:    5000
  });
});

/**
 * POST /api/traffic-events
 * Records a state transition event.
 *
 * Expected body:
 * {
 *   "previousState": "green" | "yellow" | "red" | null,
 *   "currentState":  "green" | "yellow" | "red",
 *   "timestamp":     ISO 8601 string,
 *   "reason":        "auto" | "manual" | "start"
 * }
 */
app.post('/api/traffic-events', (req, res) => {
  const { previousState, currentState, timestamp, reason } = req.body;

  // Validate
  const VALID_STATES  = new Set(['green', 'yellow', 'red']);
  const VALID_REASONS = new Set(['auto', 'manual', 'start', 'reset']);

  if (!currentState || !VALID_STATES.has(currentState)) {
    return res.status(400).json({ error: `Invalid currentState: "${currentState}"` });
  }
  if (previousState !== null && previousState !== undefined && !VALID_STATES.has(previousState)) {
    return res.status(400).json({ error: `Invalid previousState: "${previousState}"` });
  }

  const event = {
    id:            trafficEvents.length + 1,
    previousState: previousState ?? null,
    currentState,
    timestamp:     timestamp || new Date().toISOString(),
    reason:        VALID_REASONS.has(reason) ? reason : 'auto',
    receivedAt:    new Date().toISOString()
  };

  trafficEvents.push(event);
  persistEvents();

  console.log(`[Event] #${event.id}: ${event.previousState ?? 'none'} → ${event.currentState} (${event.reason})`);

  res.status(201).json({ success: true, eventId: event.id, event });
});

/**
 * GET /api/traffic-events
 * Returns the last 20 recorded events.
 */
app.get('/api/traffic-events', (_req, res) => {
  res.json({ events: trafficEvents.slice(-20), total: trafficEvents.length });
});

/**
 * POST /api/pedestrian-request
 * Acknowledges a pedestrian crossing request.
 * The actual processing happens safely in RedState.
 */
app.post('/api/pedestrian-request', (_req, res) => {
  console.log('[Pedestrian] Crossing request received.');
  res.json({
    success: true,
    queued:  true,
    message: 'Pedestrian crossing request queued. Will be processed at next RED phase.'
  });
});

// ── 404 Catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚦 SMART SIGNAL API running on http://localhost:${PORT}`);
  console.log('  GET  /api/health');
  console.log('  GET  /api/traffic-config');
  console.log('  POST /api/traffic-events');
  console.log('  POST /api/pedestrian-request\n');
});

export default app;

