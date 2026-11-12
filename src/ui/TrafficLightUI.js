/**
 * SMART SIGNAL — Traffic Light UI
 *
 * Subscribes to TrafficLightMachine events and updates the DOM.
 *
 * Design principle:
 *  NO business logic here — only DOM manipulation in response to events.
 *  The machine is the source of truth; the UI is a pure view layer.
 *
 * This satisfies the requirement:
 *  "The UI should subscribe to state changes through the state machine
 *   or a dedicated event mechanism."
 *
 * Event subscriptions:
 *  - 'stateChange'          → Update lights, label, status panel, countdown
 *  - 'transition'           → Update history panel, last-transition, cycle count
 *  - 'started'              → Update button states
 *  - 'stopped'              → Update button states, stop countdown
 *  - 'reset'                → Clear all UI back to initial values
 *  - 'logError'             → Show non-blocking warning message
 *  - 'pedestrianQueued'     → Show pedestrian status
 *  - 'pedestrianAcknowledged' → Update pedestrian status
 *  - 'configUpdated'        → Show config confirmation message
 */
export class TrafficLightUI {
  /**
   * @param {import('../core/TrafficLightMachine.js').TrafficLightMachine} machine
   */
  constructor(machine) {
    this.machine = machine;

    // ── DOM References ───────────────────────────────────────────────────
    this.lights = {
      red:    document.querySelector('.light.red'),
      yellow: document.querySelector('.light.yellow'),
      green:  document.querySelector('.light.green')
    };
    this.signalLabel        = document.getElementById('signal-label');
    this.currentStateEl     = document.getElementById('current-state');
    this.remainingTimeEl    = document.getElementById('remaining-time');
    this.nextStateEl        = document.getElementById('next-state');
    this.cycleCountEl       = document.getElementById('cycle-count');
    this.lastTransitionEl   = document.getElementById('last-transition');
    this.apiStatusEl        = document.getElementById('api-status');
    this.actionMessage      = document.getElementById('action-message');
    this.historyList        = document.getElementById('history-list');
    this.startBtn           = document.getElementById('start-btn');
    this.stopBtn            = document.getElementById('stop-btn');
    this.resetBtn           = document.getElementById('reset-btn');
    this.advanceBtn         = document.getElementById('advance-btn');
    this.pedestrianBtn      = document.getElementById('pedestrian-btn');
    this.pedestrianStatus   = document.getElementById('pedestrian-status');
    this.loadingOverlay     = document.getElementById('loading-overlay');
    this.apiWarning         = document.getElementById('api-warning');

    // Countdown state
    this._countdownInterval = null;
    this._countdownEnd      = null;
    this._messageTimeout    = null;

    this._bindMachineEvents();
    this._bindButtonEvents();
  }

  // ── Machine Event Bindings ────────────────────────────────────────────────

  _bindMachineEvents() {
    this.machine.on('stateChange',           d  => this._onStateChange(d));
    this.machine.on('transition',            d  => this._onTransition(d));
    this.machine.on('started',               () => this._onStarted());
    this.machine.on('stopped',               () => this._onStopped());
    this.machine.on('reset',                 () => this._onReset());
    this.machine.on('logError',              e  => this._onLogError(e));
    this.machine.on('pedestrianQueued',      () => this._onPedestrianQueued());
    this.machine.on('pedestrianAcknowledged',() => this._onPedestrianAcknowledged());
    this.machine.on('configUpdated',         c  => this._onConfigUpdated(c));
  }

  // ── Button Event Bindings ─────────────────────────────────────────────────

  _bindButtonEvents() {
    this.startBtn?.addEventListener('click', () => {
      this.machine.start();
      this.showMessage('▶ Traffic cycle started.', 'success');
    });

    this.stopBtn?.addEventListener('click', () => {
      this.machine.stop();
      this.showMessage('⏹ Traffic cycle stopped.', 'warning');
    });

    this.resetBtn?.addEventListener('click', () => {
      this.machine.reset();
      this.showMessage('↺ System reset to initial state.', 'info');
    });

    this.advanceBtn?.addEventListener('click', () => {
      if (!this.machine.getCurrentState()) {
        this.showMessage('⚠ Start the machine first.', 'error');
        return;
      }
      const next = this.machine.getCurrentState().getNextStateName();
      this.machine.manualAdvance();
      this.showMessage(`⏭ Manually advanced to ${next.toUpperCase()}.`, 'info');
    });

    this.pedestrianBtn?.addEventListener('click', async () => {
      if (this.pedestrianStatus) {
        this.pedestrianStatus.textContent = '⏳ Sending request...';
        this.pedestrianStatus.className = 'ped-pending';
      }
      try {
        const { requestPedestrianCrossing } = await import('../services/TrafficApi.js');
        const result = await requestPedestrianCrossing();
        this.machine.requestPedestrianCrossing();
        if (this.pedestrianStatus) {
          this.pedestrianStatus.textContent = `✅ ${result.message}`;
          this.pedestrianStatus.className = 'ped-queued';
        }
      } catch (err) {
        if (this.pedestrianStatus) {
          this.pedestrianStatus.textContent = `❌ Request failed: ${err.message}`;
          this.pedestrianStatus.className = 'ped-error';
        }
        // Fallback: still queue it locally
        this.machine.requestPedestrianCrossing();
      }
    });
  }

  // ── State Change Handler ──────────────────────────────────────────────────

  /** Update lights, label and countdown when a new state is entered. */
  _onStateChange(data) {
    // Activate only the matching light; dim all others
    Object.entries(this.lights).forEach(([color, el]) => {
      if (el) el.classList.toggle('active', color === data.state);
    });

    if (this.signalLabel)    this.signalLabel.textContent    = data.label;
    if (this.currentStateEl) this.currentStateEl.textContent = data.state.toUpperCase();
    if (this.nextStateEl)    this.nextStateEl.textContent    = data.nextState.toUpperCase();

    this._startCountdown(data.duration);
  }

  /** Update history, cycle count and last-transition after a transition. */
  _onTransition(data) {
    const timeStr = new Date(data.timestamp).toLocaleTimeString();
    if (this.lastTransitionEl) {
      this.lastTransitionEl.textContent =
        `${(data.from || 'none').toUpperCase()} → ${data.to.toUpperCase()} at ${timeStr}`;
    }
    if (this.cycleCountEl) this.cycleCountEl.textContent = data.cycleCount;
    this._addHistoryEntry(data);
  }

  _onStarted() {
    if (this.startBtn)   this.startBtn.disabled   = true;
    if (this.stopBtn)    this.stopBtn.disabled     = false;
    if (this.advanceBtn) this.advanceBtn.disabled  = false;
  }

  _onStopped() {
    if (this.startBtn) this.startBtn.disabled = false;
    if (this.stopBtn)  this.stopBtn.disabled  = true;
    this._stopCountdown();
    if (this.remainingTimeEl) this.remainingTimeEl.textContent = '--';
  }

  _onReset() {
    if (this.startBtn)   this.startBtn.disabled   = false;
    if (this.stopBtn)    this.stopBtn.disabled     = true;
    if (this.advanceBtn) this.advanceBtn.disabled  = false;
    this._stopCountdown();

    Object.values(this.lights).forEach(el => el?.classList.remove('active'));
    if (this.signalLabel)      this.signalLabel.textContent      = '---';
    if (this.currentStateEl)   this.currentStateEl.textContent   = '--';
    if (this.remainingTimeEl)  this.remainingTimeEl.textContent  = '--';
    if (this.nextStateEl)      this.nextStateEl.textContent      = '--';
    if (this.cycleCountEl)     this.cycleCountEl.textContent     = '0';
    if (this.lastTransitionEl) this.lastTransitionEl.textContent = '--';
    if (this.historyList)      this.historyList.innerHTML        = '';
    if (this.pedestrianStatus) {
      this.pedestrianStatus.textContent = '';
      this.pedestrianStatus.className   = '';
    }
  }

  _onLogError(err) {
    // Show a non-blocking warning — the cycle has NOT stopped
    this.showMessage(`⚠ Event log failed (cycle continues): ${err.message}`, 'warning');
  }

  _onPedestrianQueued() {
    if (this.pedestrianStatus) {
      this.pedestrianStatus.textContent = '🚶 Crossing queued — will process at next RED phase.';
      this.pedestrianStatus.className   = 'ped-queued';
    }
  }

  _onPedestrianAcknowledged() {
    if (this.pedestrianStatus) {
      this.pedestrianStatus.textContent = '✅ Pedestrian crossing acknowledged at RED phase!';
      this.pedestrianStatus.className   = 'ped-done';
    }
    setTimeout(() => {
      if (this.pedestrianStatus) {
        this.pedestrianStatus.textContent = '';
        this.pedestrianStatus.className   = '';
      }
    }, 4000);
  }

  _onConfigUpdated(cfg) {
    this.showMessage(
      `⚙ Config applied: G=${cfg.greenDuration/1000}s  Y=${cfg.yellowDuration/1000}s  R=${cfg.redDuration/1000}s`,
      'info'
    );
  }

  // ── Countdown Timer ───────────────────────────────────────────────────────

  _startCountdown(durationMs) {
    this._stopCountdown();
    this._countdownEnd = Date.now() + durationMs;

    const tick = () => {
      const remaining = Math.max(0, this._countdownEnd - Date.now());
      if (this.remainingTimeEl) {
        this.remainingTimeEl.textContent = (remaining / 1000).toFixed(1) + 's';
      }
    };
    tick();
    this._countdownInterval = setInterval(tick, 100);
  }

  _stopCountdown() {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
    this._countdownEnd = null;
  }

  // ── Transition History ────────────────────────────────────────────────────

  _addHistoryEntry(data) {
    if (!this.historyList) return;
    const li = document.createElement('li');
    const timeStr = new Date(data.timestamp).toLocaleTimeString();
    li.className  = `history-${data.to}`;
    li.textContent = `[${timeStr}]  ${(data.from || 'none').toUpperCase()} → ${data.to.toUpperCase()}  (${data.reason})`;
    this.historyList.insertBefore(li, this.historyList.firstChild);
    // Cap at 20 entries
    while (this.historyList.children.length > 20) {
      this.historyList.removeChild(this.historyList.lastChild);
    }
  }

  // ── Status / Feedback ─────────────────────────────────────────────────────

  /**
   * Show a temporary action confirmation message.
   * @param {string} text
   * @param {'success'|'warning'|'error'|'info'} [type]
   */
  showMessage(text, type = 'info') {
    if (!this.actionMessage) return;
    if (this._messageTimeout) clearTimeout(this._messageTimeout);
    this.actionMessage.textContent  = text;
    this.actionMessage.className    = `action-message ${type}`;
    this.actionMessage.style.display = 'block';
    this._messageTimeout = setTimeout(() => {
      if (this.actionMessage) this.actionMessage.style.display = 'none';
    }, 4000);
  }

  showLoading(visible) {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = visible ? 'flex' : 'none';
    }
  }

  showApiWarning(visible, message) {
    if (this.apiWarning) {
      this.apiWarning.style.display = visible ? 'block' : 'none';
      if (message) this.apiWarning.textContent = `⚠ ${message}`;
    }
  }

  setApiStatus(connected) {
    if (this.apiStatusEl) {
      this.apiStatusEl.textContent = connected ? '🟢 Connected' : '🔴 Offline (defaults)';
      this.apiStatusEl.className   = connected ? 'api-connected' : 'api-offline';
    }
  }
}

