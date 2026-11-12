# 🚦 SMART SIGNAL

**A State-Based Traffic Light Management System**

> Academic demonstration of the **State Design Pattern** (GoF Behavioural Pattern) and **Asynchronous JavaScript** using Promises, async/await, and the Fetch API.

---

## Project Overview

SMART SIGNAL is a complete, interactive web application that simulates an intelligent traffic light controller. It demonstrates:

- The **State Design Pattern** — each traffic phase (Green, Yellow, Red) is encapsulated in a dedicated state class.
- **Automatic state transitions** via timer-driven callbacks with stale-callback protection.
- **Asynchronous API integration** — configuration is loaded from an Express REST API, and transition events are logged non-blocking using `Promise.catch()`.
- **Graceful degradation** — the application runs correctly even when the backend API is offline.

---

## State Design Pattern Explanation

The **State Pattern** (GoF Behavioural Pattern) allows an object — the **Context** — to change its behaviour when its internal state changes. The object appears to change its class.

### Participants

| Role | Class | Responsibility |
|------|-------|---------------|
| **Context** | `TrafficLightMachine` | Owns the `currentState` reference; delegates behaviour to it; owns all transitions via `transitionTo()` |
| **Abstract State** | `TrafficLightState` | Defines the interface (`enter`, `exit`, `getName`, `getLabel`, `getNextStateName`, `getDuration`) |
| **Concrete States** | `GreenState`, `YellowState`, `RedState` | Implement phase-specific behaviour; request next transitions through the Context |

### Key Design Decisions

- **No state calls another state directly.** All transitions go through `machine.transitionTo()`.
- **UI never touches state classes.** The UI subscribes to machine events (`machine.on('stateChange', ...)`).
- **State instances are reused.** One instance per state type; all mutable data lives on the machine.

---

## State Transition Diagram

```
        ┌─────────────────────────────────────────┐
        │                                         │
        ▼       auto (5s)                         │
   ┌─────────┐ ──────────► ┌──────────┐           │
   │  GREEN  │             │  YELLOW  │           │
   │  (GO)   │             │ (CAUTION)│           │
   └─────────┘             └──────────┘           │
        ▲                       │ auto (2s)       │
        │                       ▼                 │
        │              ┌────────────┐             │
        │              │    RED     │             │
        └──────────────│   (STOP)   │─────────────┘
          auto (5s)    └────────────┘
```

**Cycle:** GREEN → YELLOW → RED → GREEN (repeating)

Manual Advance follows the same sequence — Yellow is **never skipped**.

---

## Project Structure

```
SMART_SIGNAL/
├── index.html                    # HTML5 dashboard
├── package.json                  # npm scripts & dependencies
├── vite.config.js                # Vite dev server + API proxy
├── README.md                     # This file
│
├── src/
│   ├── main.js                   # Application entry point (async init)
│   ├── styles.css                # Dark-themed professional dashboard CSS
│   │
│   ├── states/
│   │   ├── TrafficLightState.js  # Abstract base class (State interface)
│   │   ├── GreenState.js         # Concrete State — GO phase
│   │   ├── YellowState.js        # Concrete State — CAUTION phase
│   │   └── RedState.js           # Concrete State — STOP phase
│   │
│   ├── core/
│   │   └── TrafficLightMachine.js # Context — owns transitions & events
│   │
│   ├── services/
│   │   └── TrafficApi.js          # Async API client (fetch, async/await)
│   │
│   ├── ui/
│   │   └── TrafficLightUI.js      # DOM updates subscribed to machine events
│   │
│   └── tests/
│       └── run-tests.js           # Automated test suite (16 test groups)
│
├── server/
│   └── index.js                  # Express REST API (Node.js)
│
└── data/
    └── traffic-events.json        # Persisted transition event log
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend structure | HTML5 |
| Styling & animations | CSS3 (custom properties, keyframes, grid) |
| Application logic | Vanilla JavaScript — ES Modules (no frameworks) |
| Async patterns | Promises, async/await, Fetch API |
| Backend | Node.js + Express |
| Dev server & build | Vite 5 |

---

## Installation

```bash
# Clone or open the project directory
cd path/to/Traffic-light-state_machine

# Install all dependencies (Express, Vite, cors)
npm install
```

---

## Running the Application

The application requires **two terminals** running simultaneously.

### Terminal 1 — Start the Backend API

```bash
npm run server
```

Output:
```
🚦 SMART SIGNAL API running on http://localhost:3001
  GET  /api/health
  GET  /api/traffic-config
  POST /api/traffic-events
  POST /api/pedestrian-request
```

### Terminal 2 — Start the Frontend Dev Server

```bash
npm run dev
```

Output:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser.

> **Note:** If the backend is not running, the application falls back to safe default configuration (5s/2s/5s) and displays a warning banner. The traffic light cycle still works fully.

### Production Build

```bash
npm run build      # Creates dist/ directory
npm run preview    # Serves the production build
```

---

## How Async Configuration Loading Works

```
Application starts
       │
       ▼
ui.showLoading(true)              ← Loading overlay shown
       │
       ▼ async/await
healthCheck()                     ← GET /api/health
       │
       ├── OK  → apiConnected = true
       └── FAIL → show warning, use defaults
       │
       ▼ async/await
getTrafficConfig()                ← GET /api/traffic-config
       │
       ├── OK  → machine.setConfig(config)
       └── FAIL → config._usedDefaults = true, show warning
       │
       ▼
machine.setEventLogger(logTrafficEvent)   ← inject non-blocking logger
       │
       ▼
machine.start()                   ← Enters GreenState
       │
       ▼
ui.showLoading(false)             ← Loading overlay hidden
```

Key point: If the API is unreachable at startup, `getTrafficConfig()` catches the error internally and returns `DEFAULT_CONFIG`. The machine always starts successfully.

---

## How Async Event Logging Works

Every state transition triggers non-blocking logging:

```js
// Inside TrafficLightMachine.transitionTo():
if (this._logEvent) {
  this._logEvent({
    previousState: 'green',
    currentState:  'yellow',
    timestamp:     '2024-01-01T12:00:00.000Z',
    reason:        'auto'
  }).catch(err => {
    console.warn('[Machine] Event logging failed (non-fatal):', err.message);
    this.emit('logError', err);  // UI shows non-blocking warning
  });
}
// Execution continues immediately — cycle is NOT paused
```

**Why `.catch()` and not `await`?**  
Using `await` would pause the state machine until the HTTP request completes. If the API is slow or offline, the traffic light would freeze. Using `.catch()` fires the request and continues — the cycle runs at exactly the configured durations regardless of API latency.

---

## API Reference

### GET /api/health
```json
{ "status": "ok", "timestamp": "...", "uptime": 42.1, "events": 15 }
```

### GET /api/traffic-config
```json
{ "greenDuration": 5000, "yellowDuration": 2000, "redDuration": 5000 }
```

### POST /api/traffic-events
Request:
```json
{
  "previousState": "green",
  "currentState":  "yellow",
  "timestamp":     "2024-01-01T12:00:05.000Z",
  "reason":        "auto"
}
```
Response:
```json
{ "success": true, "eventId": 3, "event": { ... } }
```

### POST /api/pedestrian-request
Response:
```json
{ "success": true, "queued": true, "message": "Will be processed at next RED phase." }
```

---

## Running the Tests

```bash
npm test
# or
node src/tests/run-tests.js
```

Expected output: **52 passed, 0 failed**

### Tests Covered

| # | Test |
|---|------|
| 1 | Application initialises correctly |
| 2 | Initial state is Green |
| 3 | Green → Yellow transition |
| 4 | Yellow → Red transition |
| 5 | Red → Green transition (full cycle) |
| 6 | Only one signal indicator is active |
| 7 | Manual Advance follows valid transitions (Yellow never skipped) |
| 8 | Stop clears the current timer |
| 9 | Reset returns to initial state |
| 10 | Repeated Start does not create duplicate timers |
| 11 | API configuration loads correctly |
| 12 | Invalid API configuration is rejected (uses safe defaults) |
| 13 | API failure activates safe default timings |
| 14 | Transition logging happens asynchronously (non-blocking) |
| 15 | Logging failure does not stop the traffic cycle |
| 16 | Stale timer callbacks cannot overwrite a newer state |

---

## Browser Console Testing

After the app loads, the state machine is exposed on `window.__smartSignal`:

```js
// In the browser console:
__smartSignal.machine.stop()
__smartSignal.machine.start()
__smartSignal.machine.manualAdvance()
__smartSignal.machine.reset()
__smartSignal.machine.getConfig()
__smartSignal.machine.getCycleCount()
__smartSignal.machine.getHistory()

// Simulate an API config change:
__smartSignal.machine.setConfig({ greenDuration: 2000, yellowDuration: 1000, redDuration: 3000 })
```

---

## Key Academic Concepts Demonstrated

### 1. State Design Pattern
- Abstract base class with `enter()`, `exit()`, `getName()`, `getLabel()`, `getNextStateName()`, `getDuration()`.
- Context (`TrafficLightMachine`) is the single owner of all transitions.
- UI observes via events — no direct coupling between UI and state classes.

### 2. Promises
- `fetch()` returns a Promise; composed with `async/await` in `TrafficApi.js`.
- Non-blocking logging: `logTrafficEvent(event).catch(handleError)`.

### 3. async/await
- Sequential async init in `main.js` — health check then config fetch, written as straight-line code.
- `try/catch` for graceful error handling at every async boundary.

### 4. Stale Callback Prevention
- `generationId` counter incremented on every transition.
- Timer callbacks capture the generation at entry and abort if mismatched.

### 5. Observer / Event Emitter
- `machine.on(event, handler)` / `machine.emit(event, data)` — decouples UI from business logic.

---

## Screenshots

> _Run the application and take screenshots during each phase for submission._

| View | Description |
|------|-------------|
| Green phase | Green light glowing, label shows GO, 5.0s countdown |
| Yellow phase | Yellow light glowing, label shows CAUTION, 2.0s countdown |
| Red phase | Red light glowing, label shows STOP, 5.0s countdown |
| Transition history | Log panel showing recent state changes with timestamps |
| API offline mode | Yellow warning banner, red API status indicator |

---

## Author

Academic Assignment — VIT  
State Design Pattern (GoF) · Asynchronous JavaScript · ES Modules

