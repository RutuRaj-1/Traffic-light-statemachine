/**
 * SMART SIGNAL — Traffic API Service
 *
 * Provides async/await wrappers around the Express REST backend.
 *
 * Key async patterns demonstrated in this module:
 * ─────────────────────────────────────────────────────────────────────
 * 1. ASYNC/AWAIT:   Every public function is async. Sequential operations
 *    are written as straight-line code without callback nesting.
 *
 * 2. TRY/CATCH:     All fetch() calls are wrapped in try/catch so network
 *    failures are converted to meaningful thrown errors rather than
 *    unhandled promise rejections.
 *
 * 3. RESPONSE VALIDATION:  response.ok is always checked before parsing
 *    JSON. A non-2xx status is treated as an error.
 *
 * 4. GRACEFUL DEGRADATION: getTrafficConfig() catches its own error and
 *    returns safe defaults so the UI initialisation can always proceed.
 *
 * 5. NON-BLOCKING LOGGING: logTrafficEvent() throws on failure.
 *    The caller (TrafficLightMachine) uses .catch() — it does NOT await
 *    the result — so the traffic cycle is never blocked by an API call.
 */

const API_BASE = '/api';

/** Safe default durations used when the API cannot be reached */
export const DEFAULT_CONFIG = Object.freeze({
  greenDuration:  5000,
  yellowDuration: 2000,
  redDuration:    5000
});

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check whether the backend API server is reachable.
 *
 * @returns {Promise<{ status: string, timestamp: string, uptime: number }>}
 * @throws {Error} if the server is unreachable or returns a non-OK status
 *
 * @example
 * try {
 *   const health = await healthCheck();
 *   console.log('API online:', health.status);
 * } catch (err) {
 *   console.warn('API offline:', err.message);
 * }
 */
export async function healthCheck() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch the traffic light timing configuration from the API.
 *
 * Returns safe defaults if the request fails (network error, bad status,
 * or invalid JSON shape). Callers can detect fallback via result._usedDefaults.
 *
 * @returns {Promise<{ greenDuration: number, yellowDuration: number, redDuration: number, _usedDefaults?: boolean }>}
 *
 * @example
 * const config = await getTrafficConfig();
 * if (config._usedDefaults) showWarning('Using fallback config');
 * machine.setConfig(config);
 */
export async function getTrafficConfig() {
  try {
    const response = await fetch(`${API_BASE}/traffic-config`);
    if (!response.ok) {
      throw new Error(`Config fetch failed: HTTP ${response.status}`);
    }
    const cfg = await response.json();

    // Validate the shape of the response
    if (
      typeof cfg.greenDuration  !== 'number' ||
      typeof cfg.yellowDuration !== 'number' ||
      typeof cfg.redDuration    !== 'number'
    ) {
      throw new Error('API returned invalid configuration shape.');
    }

    return cfg;
  } catch (err) {
    console.warn('[TrafficApi] getTrafficConfig failed — using defaults:', err.message);
    return { ...DEFAULT_CONFIG, _usedDefaults: true };
  }
}

/**
 * Post a state transition event to the backend.
 *
 * This function is intentionally designed to THROW on failure.
 * The machine calls it as:
 *   logTrafficEvent(event).catch(handleError)
 * — meaning the cycle is never awaited on this call.
 *
 * This is the core async demonstration:
 *  "logTrafficEvent(event).catch(handleLoggingError)" — non-blocking.
 *
 * @param {{ previousState: string|null, currentState: string, timestamp: string, reason: string }} event
 * @returns {Promise<{ success: boolean, eventId: number }>}
 * @throws {Error} on network failure or non-OK HTTP response
 *
 * @example
 * // NON-BLOCKING — cycle continues immediately:
 * logTrafficEvent({ previousState: 'green', currentState: 'yellow', ... })
 *   .catch(err => console.warn('Log failed:', err.message));
 */
export async function logTrafficEvent(event) {
  const response = await fetch(`${API_BASE}/traffic-events`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(event)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Event logging failed: HTTP ${response.status} — ${text}`);
  }
  return response.json();
}

/**
 * Request a pedestrian crossing acknowledgement from the backend.
 *
 * @returns {Promise<{ success: boolean, queued: boolean, message: string }>}
 * @throws {Error} on network failure or non-OK HTTP response
 */
export async function requestPedestrianCrossing() {
  const response = await fetch(`${API_BASE}/pedestrian-request`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ timestamp: new Date().toISOString() })
  });
  if (!response.ok) {
    throw new Error(`Pedestrian request failed: HTTP ${response.status}`);
  }
  return response.json();
}

