# Siren Creator — Implementation Plan

## Context

A web-based electro-mechanical siren simulator for a 7-year-old. The kid can build custom sirens by choosing port counts, port shapes, motor speeds, and hear the result in real time with physics-based sound. Single HTML file, no build tools, Canvas 2D visuals, Web Audio API sound.

**Prior art found during research:**
- [airraidsirens.net Siren Frequency Generator](https://www.airraidsirens.net/beta/sirenfreqgen/) — existing tool on the siren enthusiast board (403'd, couldn't inspect code)
- [Scratch Siren Sim Maker community](https://scratch.mit.edu/projects/730940733/remixes/) — active kid community building siren sims (validates the idea)
- [AudioContext siren gist](https://gist.github.com/slv/631074e032731a84c0f5) — simple sine-modulation siren (too basic for our needs)
- [Hackaday mini mechanical siren](https://hackaday.io/project/5761-mini-mechanical-siren) — confirmed 1:1 port ratio → triangle wave, smaller stator holes → square wave
- [AudioWorklet tutorial (2025)](https://soledadpenades.com/posts/2025/using-audioworklets-to-generate-audio/) — patterns for Blob URL worklets in single-file apps

---

## Real Siren Specifications (from research)

### Frequency Formula
**Hz = ports × RPM / 60**

### Known Siren Models

| Siren | Ports | Chopper RPM | Frequencies | Interval |
|-------|-------|-------------|-------------|----------|
| **Thunderbolt 1003** (5/6) | 5 + 6 | ~7500 | 625 + 750 Hz | Minor 3rd (6:5) |
| **Thunderbolt 1000** (5) | 5 | ~7500 | 625 Hz | Single tone |
| **Federal Signal 2001** | 12 + 4 undertone | 3450 | 690 + 230 Hz | Complex |
| **2T22** | 10 + 12 | 3450 | 575 + 690 Hz | Minor 3rd |
| **Allertor 125** (9/12) | 9 + 12 | 3500 | 525 + 700 Hz | Perfect 4th (3:4) |

### Waveform Physics
- Rotor ports sweep past stator ports → periodic airflow interruption
- Port-to-blank ratio determines waveform shape:
  - 1:1 ratio (50% duty cycle) → **triangle wave** (odd harmonics, 1/n² rolloff)
  - Narrower stator holes → **more square-wave-like** (odd harmonics, 1/n rolloff)
- The overlap function of two rectangular apertures sweeping past each other produces a triangle/trapezoidal wave naturally
- Amplitude scales nonlinearly with RPM (airflow velocity ~ RPM^1.5)

---

## Architecture

Single `index.html` with three main systems:

### 1. Sound Engine (AudioWorklet via Blob URL)

The worklet runs per-sample physics on the audio thread:

```
For each sample:
  1. Update motor RPM (exponential approach toward target)
  2. Advance rotor angle: angle += (RPM * 2π / 60) / sampleRate
  3. For each ring with N ports and duty cycle d:
     - Compute triangle/trapezoidal wave from port overlap geometry
     - portPhase = (N * angle) mod 2π
     - openness = triangleWave(portPhase, dutyCycle)
  4. Sum all rings, normalize, apply RPM-based amplitude envelope
  5. Soft-clip with tanh()
```

**Port overlap waveform** (the physically correct model):

Two rectangular apertures of angular width `w` sweep past each other. The overlap
as a function of relative displacement `d` within one port period `P = 2π/N` is:
`overlap(d) = max(0, w - |d|) / w` (normalized to 0–1).

For 50% duty cycle (`w = P/2`), this is a pure triangle wave (odd harmonics, 1/n² rolloff).
For narrower duty cycles, it becomes trapezoidal, trending toward square-wave character.

```js
function portOverlap(phase, dutyCycle) {
  // phase: 0–1 within one port period, dutyCycle: 0–1
  // Convolution of two rectangular pulses of width dutyCycle
  const w = dutyCycle;
  // Center the phase so peak is at 0 (wrapped)
  let d = phase % 1.0;
  if (d > 0.5) d -= 1.0;
  // Triangle/trapezoid from overlap geometry
  const overlap = Math.max(0, w - Math.abs(d)) / w;
  return overlap;  // 0 = fully blocked, 1 = fully open
}
```

**Turbulence noise layer** (adds realism):
- Mix in low-pass-filtered white noise whose amplitude scales with RPM^1.5
- Simulates air turbulence around ports at high speed
- Cheap to compute: `Math.random()` per sample through a one-pole lowpass

**Horn resonance** (shapes the tone):
- Apply a BiquadFilterNode (bandpass) after the worklet output
- Tunable center frequency and Q per preset to simulate different horn geometries
- Done on the main audio graph, not inside the worklet

**Motor dynamics** (also in the worklet for sample-accurate pitch):
- Spin-up: `rpm += (target - rpm) * (1 - exp(-dt / tauUp))` — approaches target exponentially
- Spin-down: `rpm *= exp(-dt / tauDown)` — decays toward zero exponentially
- Note: the asymmetry between spin-up/spin-down formulas is intentional — motor applies torque
  on spin-up (approaches target), friction/drag decelerates on spin-down (decays to zero)
- Wail: target oscillates sinusoidally between `maxRPM * wailMin` and `maxRPM`
- Alert: target alternates between `maxRPM` and `0` on a timer

**Message protocol:**
- Main → Worklet: `config` (rings array), `motor` (RPM/mode/running), `volume`
- Worklet → Main: `telemetry` (rpm) every ~50ms
- Main thread predicts rotor angle locally at 60fps using received RPM
  (decouples animation smoothness from message frequency)

### 2. Canvas Rotor Editor (Canvas 2D)

Top-down view of the siren rotor disc:
- Concentric rings, each showing evenly-spaced port holes
- Click a ring to select it → shows ring controls (port count slider, shape toggle, duty cycle)
- `+` button to add rings (max 4), `×` to remove
- Animates rotation synced to worklet telemetry via `requestAnimationFrame`
- RPM bar gauge below the rotor
- HiDPI-aware canvas scaling

**Interaction model (kid-friendly):**
- No individual hole toggling (too fiddly for a 7yo)
- Click ring to select → adjust port count with a big slider
- Port count slider (range 4–16) labeled with hole count numbers
- "Hole Shape" toggle: round vs square (icons, not text)
- "Hole Size" slider: small↔big (duty cycle 0.2–0.8)

### 3. UI Controls (HTML/CSS)

**Layout** — CSS Grid, responsive:
```
Desktop: [Canvas | Controls] / [Presets bar]
Mobile:  [Canvas] / [Controls] / [Presets]
```

**Controls panel:**
- **START/STOP** — giant button, green→red, pulsing glow when active
- **Speed slider** — "How Fast?" with gradient track, shows RPM
- **Mode buttons** — STEADY / WAIL / ALERT (three big toggles with wave-shape icons)
- **Selected ring controls** — port count, shape, hole size, enable/disable
- **Volume slider**
- **Advanced (collapsible)**: Motor Power, Rotor Weight, Wail Speed
  (Dual-motor/dual-rotor cut from v1 — multi-ring already handles dual-tone sirens)

**Design:**
- Dark background (#1a1a2e) so colored controls pop
- All buttons ≥48px touch targets
- Base font 18px, nothing below 14px
- Rounded corners everywhere (12px)
- Bright ring colors: red, teal, yellow, green (one per ring)
- No text inputs except siren name on save

---

## Presets

Four built-in presets using real siren data:

1. **🌪️ Tornado Siren** (Thunderbolt 1003)
   - Rings: 5 + 6 ports, rectangular, 50% duty cycle
   - Motor: maxRPM 7500, tauUp 12s, tauDown 18s
   - Mode: wail (period 12s, min 35%)

2. **🏙️ City Siren** (2T22-style)
   - Rings: 10 + 12 ports, rectangular, 50% duty cycle
   - Motor: maxRPM 3450, tauUp 8s, tauDown 12s
   - Mode: wail (period 10s, min 40%)

3. **✈️ Air Raid** (Allertor 125-style)
   - Rings: 9 + 12 ports, rectangular, 50% duty cycle
   - Motor: maxRPM 3500, tauUp 7s, tauDown 10s
   - Mode: wail (period 15s, min 30%)

4. **🔔 Simple Tone** (learning siren)
   - Ring: 8 ports, round, 50% duty cycle
   - Motor: maxRPM 3000, tauUp 5s, tauDown 8s
   - Mode: steady

---

## Save/Load/Share

- localStorage key: `sirenCreator_saves`
- Save format: `{ version: 1, name, timestamp, state: { rotor, motor, volume } }`
- Save UI: modal with name input (pre-filled "My Siren #N") + big SAVE button
- Load UI: modal with scrollable list, tap to load, × to delete
- Max ~20 saves (localStorage limit ~5MB is plenty)
- **URL sharing**: encode siren config as base64 JSON in URL hash (`#config=...`)
  so creations survive cache clears and can be shared with friends

---

## Implementation Order

| Phase | What | Testable outcome |
|-------|------|-----------------|
| 1 | HTML skeleton + AudioWorklet with single ring, fixed RPM + "tap to start" overlay + worklet error handling | Click START, hear a buzzy tone (graceful error if worklet fails) |
| 2 | Motor physics (spin-up/down, wail, alert modes) | Hear realistic spin-up growl, wail sweep |
| 3 | Multi-ring support + duty cycle + port shapes + noise layer + horn resonance filter | Thunderbolt dual-tone chord is recognizable and sounds mechanical, not synthetic |
| 4 | CSS layout + control panel UI | Controls work and affect sound in real-time |
| 5 | Canvas rotor editor + animation | Visual rotor spins in sync with sound |
| 6 | Presets | Each preset sounds distinct, matches real siren character |
| 7 | Save/load | Round-trip save, reload page, load back |
| 7.5 | URL hash sharing | "Copy Link" button encodes config in URL, loading URL restores siren |
| 8 | Polish | Responsive layout, RPM gauge, edge cases, mobile touch, Safari/iOS testing |

---

## Verification

1. **Frequency check**: 10-port ring at 3450 RPM should produce ~575 Hz — verify with browser DevTools audio inspector or spectrum analyzer
2. **Waveform check**: Rectangular ports at 50% duty cycle should show triangle-wave harmonics (odd harmonics, -12dB/octave rolloff)
3. **Spin-up realism**: Compare spectrogram against YouTube recordings of Thunderbolt 1003 spin-ups
4. **Dual tone**: Thunderbolt preset should produce two audible tones in a minor third interval
5. **UI usability**: Have the 7-year-old actually use it — can he find the start button, change port counts, load presets, save his creation?
6. **Mobile**: Test at 360px viewport width, verify touch targets work
7. **Audio lifecycle**: First click creates AudioContext (browser requirement), no duplicate contexts, handles suspend/resume
