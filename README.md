# Siren Creator

A web-based electro-mechanical siren simulator built as a toy for my 7-year-old son who loves tornado sirens.

Open `index.html` in any browser — no install, no build tools, no dependencies.

## What it does

Kids can build and customize their own sirens by tweaking the mechanical parts that make the sound:

- **Rotor ports** — add up to 4 rings of holes with different counts (4–16), shapes (round/square), and sizes
- **Motor controls** — adjust speed (RPM), pick a mode (steady, wail, alert), tune motor power and rotor weight
- **Presets** — Tornado Siren (Federal Signal Thunderbolt 1003), City Siren (2T22), Air Raid (Allertor 125), and a simple learning tone
- **Save/Load** — save custom sirens to the browser, or share them as a URL

## How the sound works

The sound is generated in real-time using the Web Audio API (AudioWorklet), modeling actual siren physics:

- A rotor disc with slotted ports spins past a matching stator disc
- When ports align, air flows through → pressure pulse
- When misaligned, air is blocked → silence
- This periodic chopping creates the siren tone: **frequency = ports × RPM / 60**
- Multiple rings with different port counts produce a chord (e.g., Thunderbolt's 5/6 ports = minor third)
- Motor dynamics simulate realistic spin-up growl, coast-down, and wail sweeps

The side-view visualization shows the stator and rotor port bands scrolling past each other so you can literally see how the sound is made.

## Preset specs

| Preset | Based on | Ports | RPM | Frequencies |
|--------|----------|-------|-----|-------------|
| Tornado | Thunderbolt 1003 | 5 + 6 | 7500 | 625 + 750 Hz |
| City | Federal Signal 2T22 | 10 + 12 | 3450 | 575 + 690 Hz |
| Air Raid | ACA Allertor 125 | 9 + 12 | 3500 | 525 + 700 Hz |
| Simple | — | 8 | 3000 | 400 Hz |

## License

MIT
