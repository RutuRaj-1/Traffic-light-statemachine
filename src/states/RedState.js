/**
 * RedState — Concrete State (State Design Pattern)
 *
 * Represents the RED (stop) phase of the traffic light.
 *
 * Behaviour when entered:
 *  1. Emits 'stateChange' so the UI activates the red indicator and shows STOP.
 *  2. Checks for a queued pedestrian crossing request and acknowledges it safely.
 *  3. Starts a timer for the configured red duration.
 *  4. When the timer fires, checks the generationId (stale-callback guard).
 *  5. Automatically transitions to GreenState.
 *
 * Pedestrian crossing safety:
 *  Requests are only processed here (RED phase) so that Green→Red shortcuts
 *  are impossible. The machine sets pedestrianPending = true when a request
 *  arrives; RedState checks and clears the flag on entry.
 */
import { TrafficLightState } from './TrafficLightState.js';

export class RedState extends TrafficLightState {
  constructor(machine) {
    super(machine);
    this._timerId = null;
  }

  getName() { return 'red'; }
  getLabel() { return 'STOP'; }
  getNextStateName() { return 'green'; }
  getDuration() { return this.machine.config.redDuration; }

  /**
   * Enter the RED state.
   * @param {number} generationId
   */
  enter(generationId) {
    this.machine.emit('stateChange', {
      state: this.getName(),
      label: this.getLabel(),
      nextState: this.getNextStateName(),
      duration: this.getDuration()
    });

    // Safely process a queued pedestrian crossing at this point in the cycle.
    if (this.machine.pedestrianPending) {
      this.machine.pedestrianPending = false;
      this.machine.emit('pedestrianAcknowledged');
    }

    this._timerId = setTimeout(() => {
      if (this.machine.generationId !== generationId) return;
      this.machine.transitionTo('green', 'auto');
    }, this.getDuration());
  }

  exit() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }
}

