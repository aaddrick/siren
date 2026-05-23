// ============================================================
// AUDIO ENGINE (main thread)
// ============================================================
let audioCtx = null;
let sirenNode = null;
let hornFilter = null;
let gainNode = null;
let analyser = null;
let audioReady = false;
let recordDest = null;
let mediaRecorder = null;
let recordedChunks = [];
let vizMode = 'wave';

// Ambient environment nodes
let distanceFilter = null;
let distanceGain = null;
let reverbSendGain = null;
let convolverNode = null;

// Tornado ambient noise nodes
let tornadoWindOsc = null;
let tornadoWindFilter = null;
let tornadoWindGain = null;
let tornadoNoiseSource = null;
let tornadoNoiseFilter = null;
let tornadoNoiseGain = null;
let tornadoNoiseBuffer = null;

function createImpulseResponse(duration, decay) {
  const len = audioCtx.sampleRate * duration;
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

async function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    sirenNode = new AudioWorkletNode(audioCtx, 'siren-processor');

    // Horn resonance filter
    hornFilter = audioCtx.createBiquadFilter();
    hornFilter.type = 'peaking';
    hornFilter.frequency.value = state.horn.freq;
    hornFilter.Q.value = state.horn.Q;
    hornFilter.gain.value = state.horn.gain ?? 8;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = 1.0;

    recordDest = audioCtx.createMediaStreamDestination();

    // Distance simulation: lowpass filter to muffle at distance
    distanceFilter = audioCtx.createBiquadFilter();
    distanceFilter.type = 'lowpass';
    distanceFilter.frequency.value = 20000;
    distanceFilter.Q.value = 0.7;

    // Distance gain: attenuate at distance
    distanceGain = audioCtx.createGain();
    distanceGain.gain.value = 1.0;

    // Reverb via convolver
    const envPreset = ENV_PRESETS[state.environment.preset] || ENV_PRESETS.outdoor;
    convolverNode = audioCtx.createConvolver();
    convolverNode.buffer = createImpulseResponse(envPreset.duration, envPreset.decay);

    reverbSendGain = audioCtx.createGain();
    reverbSendGain.gain.value = envPreset.reverbSend;

    // Chain: sirenNode → hornFilter → gainNode → distanceFilter → distanceGain → destination
    //        distanceGain → reverbSendGain → convolver → destination
    sirenNode.connect(hornFilter);
    hornFilter.connect(gainNode);
    gainNode.connect(distanceFilter);
    distanceFilter.connect(distanceGain);
    distanceGain.connect(audioCtx.destination);
    distanceGain.connect(recordDest);

    distanceGain.connect(reverbSendGain);
    reverbSendGain.connect(convolverNode);
    convolverNode.connect(audioCtx.destination);

    // Analyser for waveform/spectrum visualizer
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    gainNode.connect(analyser);

    sirenNode.port.onmessage = (e) => {
      if (e.data.type === 'telemetry') {
        state.currentRPM = e.data.rpm;
      }
    };

    sendConfig();
    sendMotor();
    sendVolume();

    audioReady = true;
    document.getElementById('btn-record').disabled = false;
  } catch (err) {
    const banner = document.getElementById('error-banner');
    banner.textContent = 'Could not start audio engine. Try using Chrome or Firefox!';
    banner.classList.add('show');
    console.error('Audio init failed:', err);
  }
}

function sendConfig() {
  if (!sirenNode) return;
  sirenNode.port.postMessage({
    type: 'config',
    rings: state.rings.map(r => ({
      portCount: r.portCount,
      portShape: r.portShape,
      statorDutyCycle: r.statorDutyCycle,
      rotorDutyCycle: r.rotorDutyCycle,
      shutterOpen: r.shutterOpen,
      enabled: r.enabled,
    })),
  });
}

function sendMotor() {
  if (!sirenNode) return;
  sirenNode.port.postMessage({
    type: 'motor',
    running: state.motor.running,
    maxRPM: state.motor.maxRPM,
    mode: state.motor.mode,
    tauUp: state.motor.tauUp,
    tauDown: state.motor.tauDown,
    wailPeriod: state.motor.wailPeriod,
    wailMin: state.motor.wailMin,
    alertPeriod: state.motor.alertPeriod,
    alertDuty: state.motor.alertDuty,
  });
}

function sendVolume() {
  if (!sirenNode) return;
  sirenNode.port.postMessage({ type: 'volume', level: state.volume });
}

function sendShutter(ringIndex, open) {
  if (!sirenNode) return;
  sirenNode.port.postMessage({ type: 'shutter', ring: ringIndex, open: open });
}

function updateHornFilter() {
  if (!hornFilter) return;
  hornFilter.frequency.value = state.horn.freq;
  hornFilter.Q.value = state.horn.Q;
  hornFilter.gain.value = state.horn.gain ?? 8;
}

function updateDistance(d) {
  if (!distanceFilter || !distanceGain || !reverbSendGain) return;
  const envPreset = ENV_PRESETS[state.environment.preset] || ENV_PRESETS.outdoor;
  const filterMul = envPreset.filterMul;
  // Exponential mapping: close = full freq/volume, far = muffled/quiet
  distanceFilter.frequency.value = 20000 * Math.pow(800 / 20000, d) * filterMul;
  distanceGain.gain.value = 1.0 * Math.pow(0.15, d);
  reverbSendGain.gain.value = envPreset.reverbSend + d * 0.4;
}

function applyEnvironmentPreset(presetKey) {
  const envPreset = ENV_PRESETS[presetKey];
  if (!envPreset) return;
  state.environment.preset = presetKey;

  // Rebuild convolver IR for the new environment
  if (convolverNode && audioCtx) {
    convolverNode.buffer = createImpulseResponse(envPreset.duration, envPreset.decay);
  }

  // Re-apply distance with new preset parameters
  updateDistance(state.environment.distance);

  // Handle tornado ambient noise
  if (envPreset.tornado) {
    startTornadoNoise();
  } else {
    stopTornadoNoise();
  }
}

function startTornadoNoise() {
  if (!audioCtx || tornadoWindOsc) return;

  // Wind: low-frequency oscillator through a lowpass filter
  tornadoWindOsc = audioCtx.createOscillator();
  tornadoWindOsc.type = 'sawtooth';
  tornadoWindOsc.frequency.value = 60;

  tornadoWindFilter = audioCtx.createBiquadFilter();
  tornadoWindFilter.type = 'lowpass';
  tornadoWindFilter.frequency.value = 400;
  tornadoWindFilter.Q.value = 1.0;

  tornadoWindGain = audioCtx.createGain();
  tornadoWindGain.gain.value = 0.06;

  tornadoWindOsc.connect(tornadoWindFilter);
  tornadoWindFilter.connect(tornadoWindGain);
  tornadoWindGain.connect(audioCtx.destination);
  tornadoWindOsc.start();

  // Rain: filtered white noise
  const noiseDuration = 4;
  const noiseLen = audioCtx.sampleRate * noiseDuration;
  tornadoNoiseBuffer = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate);
  const noiseData = tornadoNoiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

  tornadoNoiseSource = audioCtx.createBufferSource();
  tornadoNoiseSource.buffer = tornadoNoiseBuffer;
  tornadoNoiseSource.loop = true;

  tornadoNoiseFilter = audioCtx.createBiquadFilter();
  tornadoNoiseFilter.type = 'bandpass';
  tornadoNoiseFilter.frequency.value = 3000;
  tornadoNoiseFilter.Q.value = 0.5;

  tornadoNoiseGain = audioCtx.createGain();
  tornadoNoiseGain.gain.value = 0.04;

  tornadoNoiseSource.connect(tornadoNoiseFilter);
  tornadoNoiseFilter.connect(tornadoNoiseGain);
  tornadoNoiseGain.connect(audioCtx.destination);
  tornadoNoiseSource.start();
}

function stopTornadoNoise() {
  if (tornadoWindOsc) {
    try { tornadoWindOsc.stop(); } catch (e) {}
    tornadoWindOsc.disconnect();
    tornadoWindFilter.disconnect();
    tornadoWindGain.disconnect();
    tornadoWindOsc = null;
    tornadoWindFilter = null;
    tornadoWindGain = null;
  }
  if (tornadoNoiseSource) {
    try { tornadoNoiseSource.stop(); } catch (e) {}
    tornadoNoiseSource.disconnect();
    tornadoNoiseFilter.disconnect();
    tornadoNoiseGain.disconnect();
    tornadoNoiseSource = null;
    tornadoNoiseFilter = null;
    tornadoNoiseGain = null;
    tornadoNoiseBuffer = null;
  }
}
