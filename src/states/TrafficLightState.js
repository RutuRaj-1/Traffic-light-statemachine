/**
 * SMART SIGNAL — State Design Pattern
 *
 * TrafficLightState is the abstract base class for all traffic light states.
 * It defines the interface that every concrete state must implement.
 *
 * Pattern: State Design Pattern (GoF Behavioural Pattern)
 * ─────────────────────────────────────────────────────
 * The State Pattern allows an object (the Context — TrafficLightMachine) to
 * alter its behaviour when its internal state changes. The object will appear
 * to change its class. Each concrete state encapsulates the behaviour specific
 * to that traffic phase and requests transitions through the Context.
 *
 * Participants:
 *  - Context:        TrafficLightMachine (owns the current state reference)
 *  - AbstractState:  TrafficLightState   (this class — defines the interface)
 *  - ConcreteStates: GreenState, YellowState, RedState
 */
export class TrafficLightState {
  /**
   * @param {import('../core/TrafficLightMachine.js').TrafficLightMachine} machine
   *   Reference to the state machine (Context).
   */
  constructor(machine) {
    if (new.target === TrafficLightState) {
      throw new Error('TrafficLightState is abstract and cannot be instantiated directly.');
    }
    /** @protected */
    this.machine = machine;
  }

  /**
   * Called when the machine enters this state.
   * Subclasses must start their auto-transition timer here.
   *
   * @param {number} generationId
   *   Transition generation counter. The state captures this value and
   *   compares it inside the timer callback before calling transitionTo().
   *   If the machine's generationId has changed, the callback is stale and
   *   must be discarded — this prevents old timers from overwriting newer states.
   */
  enter(generationId) {
    throw new Error(`${this.constructor.name}.enter() is not implemented.`);
  }

  /**
   * Called when the machine exits this state.
   * Subclasses must clear any pending timers here to prevent leaks.
   */
  exit() {
    throw new Error(`${this.constructor.name}.exit() is not implemented.`);
  }

  /**
   * Returns the canonical lowercase name of this state ('green', 'yellow', 'red').
   * @returns {string}
   */
  getName() {
    throw new Error(`${this.constructor.name}.getName() is not implemented.`);
  }

  /**
   * Returns the display label shown in the signal UI ('GO', 'CAUTION', 'STOP').
   * @returns {string}
   */
  getLabel() {
    throw new Error(`${this.constructor.name}.getLabel() is not implemented.`);
  }

  /**
   * Returns the name of the next state in the cycle.
   * GREEN → YELLOW → RED → GREEN
   * @returns {string}
   */
  getNextStateName() {
    throw new Error(`${this.constructor.name}.getNextStateName() is not implemented.`);
  }

  /**
   * Returns the configured duration for this state in milliseconds.
   * Reads from machine.config so changes via setConfig() take effect.
   * @returns {number}
   */
  getDuration() {
    throw new Error(`${this.constructor.name}.getDuration() is not implemented.`);
  }
}

