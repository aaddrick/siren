// ============================================================
// CONSTANTS & PRESETS
// ============================================================
const RING_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF'];
const MAX_RINGS = 4;
const STORAGE_KEY = 'sirenCreator_saves';

const HORN_SHAPES = {
  narrow:      { label: 'Narrow',  freq: 900, Q: 5.0, gain: 10 },
  wide:        { label: 'Wide Bell', freq: 500, Q: 1.0, gain: 6 },
  rectangular: { label: 'Square',  freq: 700, Q: 3.0, gain: 8 },
  none:        { label: 'No Horn', freq: 1000, Q: 0.5, gain: 0 },
};

const PRESETS = {
  thunderbolt: {
    name: 'Tornado Siren',
    rings: [
      { portCount: 5, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
      { portCount: 6, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 7500, mode: 'wail',
      tauUp: 12, tauDown: 18,
      wailPeriod: 12, wailMin: 0.35,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 500, Q: 1.0, gain: 6, shape: 'wide' },
    volume: 0.7,
  },
  city: {
    name: 'City Siren',
    rings: [
      { portCount: 10, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
      { portCount: 12, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3450, mode: 'wail',
      tauUp: 8, tauDown: 12,
      wailPeriod: 10, wailMin: 0.4,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 700, Q: 3.0, gain: 8, shape: 'rectangular' },
    volume: 0.7,
  },
  airraid: {
    name: 'Air Raid',
    rings: [
      { portCount: 9, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
      { portCount: 12, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3500, mode: 'wail',
      tauUp: 7, tauDown: 10,
      wailPeriod: 15, wailMin: 0.3,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 500, Q: 1.0, gain: 6, shape: 'wide' },
    volume: 0.7,
  },
  simple: {
    name: 'Simple Tone',
    rings: [
      { portCount: 8, portShape: 'round', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3000, mode: 'steady',
      tauUp: 5, tauDown: 8,
      wailPeriod: 10, wailMin: 0.4,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 900, Q: 5.0, gain: 10, shape: 'narrow' },
    volume: 0.7,
  },
  chrysler: {
    name: 'Chrysler Air Raid',
    rings: [
      { portCount: 6, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 2950, mode: 'steady',
      tauUp: 30, tauDown: 60,
      wailPeriod: 10, wailMin: 0.4,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 400, Q: 1.5 },
    volume: 0.7,
  },
  model2: {
    name: 'Federal Model 2',
    rings: [
      { portCount: 5, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
      { portCount: 6, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3450, mode: 'wail',
      tauUp: 10, tauDown: 15,
      wailPeriod: 12, wailMin: 0.35,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 600, Q: 2.0 },
    volume: 0.7,
  },
  federal500: {
    name: 'Federal 500',
    rings: [
      { portCount: 10, portShape: 'rectangular', statorDutyCycle: 0.25, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3450, mode: 'steady',
      tauUp: 6, tauDown: 10,
      wailPeriod: 10, wailMin: 0.4,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 550, Q: 2.2 },
    volume: 0.7,
  },
  m65: {
    name: 'Sentry M-65',
    rings: [
      { portCount: 8, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    ],
    motor: {
      maxRPM: 3000, mode: 'wail',
      tauUp: 15, tauDown: 25,
      wailPeriod: 15, wailMin: 0.30,
      alertPeriod: 7, alertDuty: 0.5,
    },
    horn: { freq: 450, Q: 1.8 },
    volume: 0.7,
  },
};

// Environment presets: reverb IR params and filter tweaks
const ENV_PRESETS = {
  outdoor:  { duration: 0.8, decay: 3, reverbSend: 0.15, filterMul: 1.0, tornado: false },
  downtown: { duration: 1.5, decay: 2, reverbSend: 0.35, filterMul: 1.0, tornado: false },
  indoor:   { duration: 0.5, decay: 4, reverbSend: 0.20, filterMul: 0.7, tornado: false },
  tornado:  { duration: 0.8, decay: 3, reverbSend: 0.15, filterMul: 1.0, tornado: true  },
};

// ============================================================
// PARTS DATA (for Build mode)
// ============================================================
const PARTS = {
  motors: [
    { id: 'motor-small', label: 'Small', maxRPM: 3000, tauUp: 5 },
    { id: 'motor-medium', label: 'Medium', maxRPM: 5000, tauUp: 8 },
    { id: 'motor-large', label: 'Large', maxRPM: 8000, tauUp: 15 },
  ],
  rotors: [
    { id: 'rotor-thin', label: 'Thin (Fast)', tauDown: 6, portCount: 8 },
    { id: 'rotor-thick', label: 'Thick (Heavy)', tauDown: 15, portCount: 10 },
  ],
  horns: [
    { id: 'horn-narrow', label: 'Narrow Cone', freq: 900, Q: 5.0 },
    { id: 'horn-wide', label: 'Wide Bell', freq: 500, Q: 1.0 },
    { id: 'horn-square', label: 'Square', freq: 700, Q: 3.0 },
  ],
};

// ============================================================
// APP STATE
// ============================================================
const state = {
  rings: [
    { portCount: 10, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
    { portCount: 12, portShape: 'rectangular', statorDutyCycle: 0.5, rotorDutyCycle: 0.5, shutterOpen: true, enabled: true },
  ],
  motor: {
    maxRPM: 3450, mode: 'steady', running: false,
    tauUp: 8, tauDown: 12,
    wailPeriod: 10, wailMin: 0.4,
    alertPeriod: 7, alertDuty: 0.5,
  },
  horn: { freq: 500, Q: 1.0, gain: 6, shape: 'wide' },
  volume: 0.7,
  selectedRing: 0,
  currentRPM: 0,
  activePreset: null,
  environment: { distance: 0, preset: 'outdoor' },
  appMode: 'tune',
  assembly: { motor: null, rotor: null, horn: null },
};
