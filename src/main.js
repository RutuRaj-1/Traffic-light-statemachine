/**
 * SMART SIGNAL — Application Entry Point
 *
 * Demonstrates:
 *  1. Sequential async initialisation with async/await.
 *  2. Graceful API fallback using try/catch.
 *  3. Non-blocking event logging via Promise .catch().
 *
 * Initialisation sequence (Phase 7):
 *  Step 1: Show loading overlay.
 *  Step 2: Health-check the API (async/await).
 *  Step 3: Fetch traffic configuration from API (async/await).
 *  Step 4: Validate and apply configuration to the state machine.
 *  Step 5: Inject async event logger into machine (non-blocking .catch pattern).
 *  Step 6: Start the state machine (enters GreenState).
 *  Step 7: Hide loading overlay.
 *  Fallback: on any API failure, use safe defaults + show warning.
 */
import { TrafficLightMachine } from './core/TrafficLightMachine.js';
import { TrafficLightUI }      from './ui/TrafficLightUI.js';
import {
  healthCheck,
  getTrafficConfig,
  logTrafficEvent
} from './services/TrafficApi.js';

async function initApp() {
  // ── Instantiate core objects ──────────────────────────────────────────
  const machine = new TrafficLightMachine();  // Context (State Pattern)
  const ui      = new TrafficLightUI(machine); // View (subscribes to events)

  // ── Step 1: Show loading indicator ───────────────────────────────────
  ui.showLoading(true);

  let apiConnected = false;

  // ── Step 2: Health check ─────────────────────────────────────────────
  // Demonstrates: async/await with try/catch for error handling
  try {
    await healthCheck();
    apiConnected = true;
    ui.setApiStatus(true);
    console.log('[App] ✅ API health check passed.');
  } catch (err) {
    console.warn('[App] ⚠ API unreachable:', err.message);
    ui.setApiStatus(false);
  }

  // ── Steps 3 & 4: Fetch and apply configuration ────────────────────────
  // getTrafficConfig() internally catches errors and returns safe defaults.
  // We additionally check _usedDefaults to show a warning.
  const config = await getTrafficConfig();
  if (!apiConnected || config._usedDefaults) {
    ui.showApiWarning(
      true,
      apiConnected
        ? 'Could not load API configuration — using safe defaults.'
        : 'API server offline. Run: npm run server  |  Using safe defaults.'
    );
  }
  machine.setConfig(config);
  console.log('[App] ⚙ Configuration applied:', config);

  // ── Step 5: Inject async event logger ────────────────────────────────
  // The machine calls: this._logEvent(event).catch(err => ...)
  // This is the NON-BLOCKING async logging pattern.
  // The machine never awaits the logger, so the traffic cycle is NEVER
  // paused by an API call. If logTrafficEvent rejects, the machine emits
  // 'logError' and the UI shows a non-fatal warning.
  machine.setEventLogger(logTrafficEvent);

  // ── Step 6: Start state machine ──────────────────────────────────────
  machine.start(); // Enters GreenState → emits 'started' + 'stateChange'

  // ── Step 7: Hide loading overlay ─────────────────────────────────────
  ui.showLoading(false);

  // Expose on window for browser console testing (Phase 9)
  window.__smartSignal = { machine, ui };

  console.log(
    '[App] 🚦 SMART SIGNAL ready.\n' +
    '  Console API: window.__smartSignal.machine\n' +
    '  Try: __smartSignal.machine.stop() / .start() / .manualAdvance()'
  );
}

// Bootstrap when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

