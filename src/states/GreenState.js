/**
 * GreenState — Concrete State (State Design Pattern)
 *
 * Represents the GREEN phase of the traffic light.
 *
 * Behaviour when entered:
 *  1. Emits 'stateChange' so the UI activates the green indicator and shows GO.
 *  2. Starts a timer for the configured green duration.
 *  3. When the timer fires, checks the generationId to guard against stale callbacks.
 *  4. Automatically transitions to YellowState.
 *
 * Stale-callback guard:
 *  The generationId is captured at entry. The timer callback compares it to
 *  machine.generationId before proceeding. If Stop or Manual Advance was pressed
 *  after enter() but before the timer fires, generationId will have changed and
 *  the callback silently discards itself.
 */
import { TrafficLightState } from './TrafficLightState.js';

export class GreenState extends TrafficLightState {
  constructor(machine) {
    super(machine);
    this._timerId = null;
  }

  getName() { return 'green'; }
  getLabel() { return 'GO'; }
  getNextStateName() { return 'yellow'; }
  getDuration() { return this.machine.config.greenDuration; }

  /**
   * Enter the GREEN state.
   * Emits a stateChange event (UI updates) and schedules auto-transition.
   * @param {number} generationId
   */
  enter(generationId) {
    // Notify UI via the machine's event system — no DOM access in state classes.
    this.machine.emit('stateChange', {
      state: this.getName(),
      label: this.getLabel(),
      nextState: this.getNextStateName(),
      duration: this.getDuration()
    });

    // Schedule automatic transition. Close over generationId.
    this._timerId = setTimeout(() => {
      // Stale-callback guard: abort if a newer transition has already occurred.
      if (this.machine.generationId !== generationId) return;
      this.machine.transitionTo('yellow', 'auto');
    }, this.getDuration());
  }

  /** Exit the GREEN state — clear the pending timer. */
  exit() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }
}

