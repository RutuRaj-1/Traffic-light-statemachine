/**
 * YellowState — Concrete State (State Design Pattern)
 *
 * Represents the YELLOW (caution) phase of the traffic light.
 *
 * Behaviour when entered:
 *  1. Emits 'stateChange' so the UI activates the yellow indicator and shows CAUTION.
 *  2. Starts a timer for the configured yellow duration.
 *  3. When the timer fires, checks the generationId (stale-callback guard).
 *  4. Automatically transitions to RedState.
 *
 * The Yellow state is mandatory in the cycle:
 *  GREEN → YELLOW → RED (never GREEN → RED directly).
 *  Manual Advance also follows this rule via getNextStateName().
 */
import { TrafficLightState } from './TrafficLightState.js';

export class YellowState extends TrafficLightState {
  constructor(machine) {
    super(machine);
    this._timerId = null;
  }

  getName() { return 'yellow'; }
  getLabel() { return 'CAUTION'; }
  getNextStateName() { return 'red'; }
  getDuration() { return this.machine.config.yellowDuration; }

  /**
   * Enter the YELLOW state.
   * @param {number} generationId
   */
  enter(generationId) {
    this.machine.emit('stateChange', {
      state: this.getName(),
      label: this.getLabel(),
      nextState: this.getNextStateName(),
      duration: this.getDuration()
    });

    this._timerId = setTimeout(() => {
      if (this.machine.generationId !== generationId) return;
      this.machine.transitionTo('red', 'auto');
    }, this.getDuration());
  }

  exit() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }
}

