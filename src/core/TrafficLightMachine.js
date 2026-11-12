/**
 * SMART SIGNAL — Traffic Light Machine (State Pattern Context)
 *
 * TrafficLightMachine is the Context in the State Design Pattern.
 * It maintains a reference to the current ConcreteState and delegates
 * all state-specific behaviour to it.
 *
 * Key design decisions:
 * ─────────────────────────────────────────────────────────────────────
 * 1. SINGLE ACTIVE STATE:    Only one state can be active at a time.
 *    transitionTo() calls exit() on the old state before enter() on the new one.
 *
 * 2. STALE CALLBACK GUARD:  generationId is incremented on every transition.
 *    State timers capture the generationId at entry and abort if it no longer
 *    matches — preventing stopped/reset machines from advancing unexpectedly.
 *
 * 3. ASYNC LOGGING:         Transition events are logged via logTrafficEvent()
 *    using the non-blocking pattern:
 *      this._logEvent(event).catch(handleError)
 *    The traffic cycle continues regardless of logging success or failure.
 *
 * 4. NO DUPLICATE TIMERS:   isRunning flag prevents duplicate start() calls.
 *
 * 5. EVENT EMITTER:         The machine emits domain events ('stateChange',
 *    'transition', 'started', 'stopped', 'reset', …). The UI subscribes via
 *    machine.on() — no direct DOM access in the machine or state classes.
 */
import { GreenState } from '../states/GreenState.js';
import { YellowState } from '../states/YellowState.js';
import { RedState } from '../states/RedState.js';

/** Minimum and maximum allowed duration in milliseconds */
const MIN_DURATION = 50;
const MAX_DURATION = 60000;

/** Safe default configuration — used when the API is unreachable */
export const DEFAULT_CONFIG = Object.freeze({
  greenDuration: 5000,
  yellowDuration: 2000,
  redDuration: 5000
});

export class TrafficLightMachine {
  constructor() {
    /**
     * The active ConcreteState.
     * @type {import('../states/TrafficLightState.js').TrafficLightState|null}
     */
    this.currentState = null;

    /** Active timing configuration */
    this.config = { ...DEFAULT_CONFIG };

    /**
     * Incremented on every transition.
     * State timer callbacks capture this value and abort if it has changed.
     * This is the stale-callback cancellation mechanism.
     */
    this.generationId = 0;

    /** True while the automatic cycle is running */
    this.isRunning = false;

    /** Number of complete GREEN→YELLOW→RED→GREEN cycles */
    this.cycleCount = 0;

    /** True when a pedestrian crossing has been requested */
    this.pedestrianPending = false;

    /** Transition log — last 50 entries */
    this.transitionHistory = [];

    /** Event listener registry */
    this._listeners = {};

    /**
     * Async event logging function injected via setEventLogger().
     * Signature: (event: object) => Promise<void>
     * @type {Function|null}
     */
    this._logEvent = null;

    /**
     * Concrete state instances — created once and reused throughout the
     * session. Reusing instances is safe because all mutable state belongs
     * to the machine (config, generationId, etc.), not the state objects.
     */
    this._states = {
      green: new GreenState(this),
      yellow: new YellowState(this),
      red: new RedState(this)
    };
  }

  // ── Event Emitter ─────────────────────────────────────────────────────────

  /**
   * Register an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this; // allow chaining
  }

  /**
   * Emit an event synchronously to all registered listeners.
   * Errors in listeners are caught and logged so they cannot crash the cycle.
   * @param {string} event
   * @param {*} [data]
   */
  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (err) {
        console.error(`[Machine] Listener error on "${event}":`, err);
      }
    });
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * Apply and validate a configuration object.
   * Values outside [MIN_DURATION, MAX_DURATION] or non-numeric values are
   * replaced with safe defaults and a warning is logged.
   *
   * @param {{ greenDuration?: number, yellowDuration?: number, redDuration?: number }} cfg
   */
  setConfig(cfg) {
    const validate = (val, key) => {
      const n = Number(val);
      if (!isFinite(n) || n < MIN_DURATION || n > MAX_DURATION) {
        console.warn(`[Machine][Config] Invalid ${key}=${val}. Using default ${DEFAULT_CONFIG[key]}ms.`);
        return DEFAULT_CONFIG[key];
      }
      return n;
    };

    this.config = {
      greenDuration:  validate(cfg.greenDuration,  'greenDuration'),
      yellowDuration: validate(cfg.yellowDuration, 'yellowDuration'),
      redDuration:    validate(cfg.redDuration,    'redDuration')
    };

    this.emit('configUpdated', { ...this.config });
  }

  /**
   * Inject an async event logger.
   * The machine calls: this._logEvent(event).catch(handleError)
   * @param {Function} logFn
   */
  setEventLogger(logFn) {
    this._logEvent = logFn;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start the automatic traffic cycle in GreenState.
   * No-op (with a warning) if the machine is already running.
   */
  start() {
    if (this.isRunning) {
      console.warn('[Machine] Already running — ignoring duplicate start() call.');
      return;
    }
    this.isRunning = true;
    this.emit('started');
    this.transitionTo('green', 'start');
  }

  /**
   * Stop the cycle.
   * Increments generationId to invalidate any pending timer callbacks,
   * then exits the current state to clear its timer.
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.generationId++; // Cancel all pending state timers
    if (this.currentState) {
      this.currentState.exit();
    }
    this.emit('stopped');
  }

  /**
   * Reset to initial state.
   * Stops the cycle, clears history, and fires 'reset'.
   */
  reset() {
    this.stop();
    this.cycleCount = 0;
    this.transitionHistory = [];
    this.pedestrianPending = false;
    this.currentState = null;
    this.emit('reset');
  }

  /**
   * Manually advance to the next state in the sequence.
   * Follows GREEN → YELLOW → RED → GREEN — Yellow is never skipped.
   * If the machine is not running, this also (re)starts it.
   */
  manualAdvance() {
    if (!this.currentState) {
      console.warn('[Machine] manualAdvance() called with no active state — starting first.');
      this.start();
      return;
    }
    const nextName = this.currentState.getNextStateName();
    if (!this.isRunning) this.isRunning = true;
    this.transitionTo(nextName, 'manual');
  }

  // ── Transition ────────────────────────────────────────────────────────────

  /**
   * Transition the machine to a named state.
   *
   * This is the SINGLE entry point for ALL state changes in the system.
   * No state object calls another state directly — all transitions go through here.
   *
   * Sequence:
   *  1. Validate the target state name.
   *  2. Validate the transition is legal for the current cycle.
   *  3. Exit the current state (clears its timer).
   *  4. Increment generationId (invalidate old timer callbacks).
   *  5. Update cycle count if completing a full cycle.
   *  6. Record the transition in history.
   *  7. Set currentState to the new ConcreteState.
   *  8. Enter the new state (it will start its timer and emit 'stateChange').
   *  9. Emit 'transition' for the UI history panel.
   * 10. Log the event asynchronously (non-blocking).
   *
   * @param {'green'|'yellow'|'red'} stateName
   * @param {'auto'|'manual'|'start'} [reason]
   */
  transitionTo(stateName, reason = 'auto') {
    if (!this._states[stateName]) {
      console.error(`[Machine] Unknown state: "${stateName}"`);
      return;
    }

    const previousStateName = this.currentState ? this.currentState.getName() : null;

    // Validate the transition follows the allowed cycle (auto transitions only)
    if (reason === 'auto' && previousStateName) {
      if (!this._isValidAutoTransition(previousStateName, stateName)) {
        console.warn(`[Machine] Invalid auto-transition: ${previousStateName} → ${stateName}`);
        return;
      }
    }

    // --- STEP 3: Exit previous state ---
    if (this.currentState) {
      this.currentState.exit();
    }

    // --- STEP 4: Increment generation (invalidates old timer callbacks) ---
    this.generationId++;
    const gen = this.generationId;

    // --- STEP 5: Cycle count ---
    if (stateName === 'green' && previousStateName === 'red') {
      this.cycleCount++;
    }

    // --- STEP 6: Record transition ---
    const record = {
      from:      previousStateName,
      to:        stateName,
      timestamp: new Date().toISOString(),
      reason
    };
    this.transitionHistory.push(record);
    if (this.transitionHistory.length > 50) this.transitionHistory.shift();

    // --- STEP 7: Set new state ---
    this.currentState = this._states[stateName];

    // --- STEP 8: Enter new state ---
    // The state will emit 'stateChange' and start its own timer.
    this.currentState.enter(gen);

    // --- STEP 9: Emit transition event for the UI ---
    this.emit('transition', { ...record, cycleCount: this.cycleCount });

    // --- STEP 10: Async non-blocking event logging ---
    // The key async demonstration:
    //   We do NOT await this. The cycle continues immediately.
    //   If logging fails, we catch the error and emit 'logError' for the UI.
    //   The traffic signal is NEVER blocked by an API call.
    if (this._logEvent) {
      this._logEvent({
        previousState: previousStateName,
        currentState:  stateName,
        timestamp:     record.timestamp,
        reason
      }).catch(err => {
        console.warn('[Machine] Event logging failed (non-fatal):', err.message);
        this.emit('logError', err);
      });
    }
  }

  /**
   * Check whether an automatic (timer-driven) transition is valid.
   * Only the cycle order GREEN→YELLOW→RED→GREEN is allowed for auto transitions.
   * @private
   */
  _isValidAutoTransition(from, to) {
    const cycle = { green: 'yellow', yellow: 'red', red: 'green' };
    return cycle[from] === to;
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getCurrentState()     { return this.currentState; }
  getCurrentStateName() { return this.currentState ? this.currentState.getName() : null; }
  getConfig()           { return { ...this.config }; }
  getCycleCount()       { return this.cycleCount; }
  getHistory()          { return [...this.transitionHistory]; }
  getIsRunning()        { return this.isRunning; }

  /**
   * Queue a pedestrian crossing request.
   * It will be safely processed at the next RED state entry.
   */
  requestPedestrianCrossing() {
    this.pedestrianPending = true;
    this.emit('pedestrianQueued');
  }
}
