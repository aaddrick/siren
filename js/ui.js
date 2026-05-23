// ============================================================
// UI WIRING
// ============================================================

// --- Start/Stop ---
const btnStart = document.getElementById('btn-start');
btnStart.addEventListener('click', async () => {
  if (!audioReady) return;
  state.motor.running = !state.motor.running;
  sendMotor();
  btnStart.textContent = state.motor.running ? 'STOP' : 'START';
  btnStart.classList.toggle('running', state.motor.running);
});

// --- Speed slider ---
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
speedSlider.addEventListener('input', () => {
  state.motor.maxRPM = parseInt(speedSlider.value);
  speedDisplay.textContent = state.motor.maxRPM + ' RPM';
  sendMotor();
  state.activePreset = null;
  updatePresetUI();
});

// --- Mode buttons ---
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.motor.mode = btn.dataset.mode;
    sendMotor();
    document.getElementById('wail-speed-group').style.display =
      state.motor.mode === 'wail' ? '' : 'none';
    state.activePreset = null;
    updatePresetUI();
  });
});

// --- Horn shape buttons ---
document.querySelectorAll('[data-horn]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-horn]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const shape = btn.dataset.horn;
    const params = HORN_SHAPES[shape];
    state.horn.shape = shape;
    state.horn.freq = params.freq;
    state.horn.Q = params.Q;
    state.horn.gain = params.gain;
    updateHornFilter();
    state.activePreset = null;
    updatePresetUI();
  });
});

// --- Volume ---
const volumeSlider = document.getElementById('volume-slider');
const volumeDisplay = document.getElementById('volume-display');
volumeSlider.addEventListener('input', () => {
  state.volume = parseInt(volumeSlider.value) / 100;
  volumeDisplay.textContent = Math.round(state.volume * 100) + '%';
  sendVolume();
});

// --- Distance slider ---
const distanceSlider = document.getElementById('distance-slider');
const distanceDisplay = document.getElementById('distance-display');
distanceSlider.addEventListener('input', () => {
  const d = parseInt(distanceSlider.value) / 100;
  state.environment.distance = d;
  distanceDisplay.textContent = distanceSlider.value + '%';
  updateDistance(d);
});

// --- Environment buttons ---
document.querySelectorAll('.env-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.env-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyEnvironmentPreset(btn.dataset.env);
  });
});

// --- Ring controls ---
function updateRingUI() {
  const container = document.getElementById('ring-controls');
  container.innerHTML = '';

  state.rings.forEach((ring, i) => {
    const color = RING_COLORS[i % RING_COLORS.length];
    const div = document.createElement('div');
    div.className = 'ring-item' + (i === state.selectedRing ? ' selected' : '') + (!ring.enabled ? ' disabled' : '');
    div.style.borderLeftColor = color;
    div.innerHTML = `
      <div class="ring-header">
        <span><span class="ring-badge" style="background:${color}"></span>
        Ring ${i + 1}: ${ring.portCount} holes</span>
        <div class="ring-actions">
          <button class="btn-small" data-toggle="${i}">${ring.enabled ? 'ON' : 'OFF'}</button>
          ${state.rings.length > 1 ? `<button class="btn-small danger" data-remove="${i}">X</button>` : ''}
        </div>
      </div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      state.selectedRing = i;
      updateRingUI();
    });
    container.appendChild(div);
  });

  // Toggle/remove handlers
  container.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.toggle);
      state.rings[idx].enabled = !state.rings[idx].enabled;
      sendConfig();
      updateRingUI();
      state.activePreset = null;
      updatePresetUI();
    });
  });
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.remove);
      state.rings.splice(idx, 1);
      if (state.selectedRing >= state.rings.length) state.selectedRing = state.rings.length - 1;
      sendConfig();
      updateRingUI();
      state.activePreset = null;
      updatePresetUI();
    });
  });

  // Update selected ring controls
  const selControls = document.getElementById('selected-ring-controls');
  if (state.rings.length > 0 && state.selectedRing < state.rings.length) {
    selControls.style.display = '';
    const ring = state.rings[state.selectedRing];
    document.getElementById('port-count-slider').value = ring.portCount;
    document.getElementById('port-count-display').textContent = ring.portCount;
    document.getElementById('duty-slider').value = Math.round(ring.dutyCycle * 100);
    document.getElementById('duty-display').textContent = Math.round(ring.dutyCycle * 100) + '%';
    document.querySelectorAll('.shape-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.shape === ring.portShape);
    });
    // Frequency display
    const freq = ring.portCount * state.motor.maxRPM / 60;
    document.getElementById('ring-freq-display').textContent = Math.round(freq) + ' Hz';
  } else {
    selControls.style.display = 'none';
  }

  // Add ring button
  document.getElementById('btn-add-ring').style.display =
    state.rings.length >= MAX_RINGS ? 'none' : '';
}

// Add ring
document.getElementById('btn-add-ring').addEventListener('click', () => {
  if (state.rings.length >= MAX_RINGS) return;
  state.rings.push({ portCount: 8, portShape: 'rectangular', dutyCycle: 0.5, enabled: true });
  state.selectedRing = state.rings.length - 1;
  sendConfig();
  updateRingUI();
  state.activePreset = null;
  updatePresetUI();
});

// Port count slider
document.getElementById('port-count-slider').addEventListener('input', (e) => {
  if (state.selectedRing >= state.rings.length) return;
  state.rings[state.selectedRing].portCount = parseInt(e.target.value);
  document.getElementById('port-count-display').textContent = e.target.value;
  const freq = state.rings[state.selectedRing].portCount * state.motor.maxRPM / 60;
  document.getElementById('ring-freq-display').textContent = Math.round(freq) + ' Hz';
  sendConfig();
  updateRingUI();
  state.activePreset = null;
  updatePresetUI();
});

// Duty cycle slider
document.getElementById('duty-slider').addEventListener('input', (e) => {
  if (state.selectedRing >= state.rings.length) return;
  state.rings[state.selectedRing].dutyCycle = parseInt(e.target.value) / 100;
  document.getElementById('duty-display').textContent = e.target.value + '%';
  sendConfig();
  state.activePreset = null;
  updatePresetUI();
});

// Shape toggle
document.querySelectorAll('.shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.selectedRing >= state.rings.length) return;
    state.rings[state.selectedRing].portShape = btn.dataset.shape;
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sendConfig();
    state.activePreset = null;
    updatePresetUI();
  });
});

// --- Waveform visualizer toggle ---
document.getElementById('viz-wave').addEventListener('click', () => {
  vizMode = 'wave';
  document.getElementById('viz-wave').classList.add('active');
  document.getElementById('viz-spectrum').classList.remove('active');
});
document.getElementById('viz-spectrum').addEventListener('click', () => {
  vizMode = 'spectrum';
  document.getElementById('viz-spectrum').classList.add('active');
  document.getElementById('viz-wave').classList.remove('active');
});

// --- Advanced controls ---
document.getElementById('advanced-toggle').addEventListener('click', () => {
  const content = document.getElementById('advanced-content');
  content.classList.toggle('open');
});

const powerSlider = document.getElementById('power-slider');
const powerDisplay = document.getElementById('power-display');
powerSlider.addEventListener('input', () => {
  const pct = parseInt(powerSlider.value);
  powerDisplay.textContent = pct + '%';
  state.motor.tauUp = 20 * (1 - pct / 100) + 1;
  sendMotor();
});

const weightSlider = document.getElementById('weight-slider');
const weightDisplay = document.getElementById('weight-display');
weightSlider.addEventListener('input', () => {
  const pct = parseInt(weightSlider.value);
  weightDisplay.textContent = pct + '%';
  state.motor.tauDown = 30 * (pct / 100) + 2;
  sendMotor();
});

const wailSlider = document.getElementById('wail-slider');
const wailDisplay = document.getElementById('wail-display');
wailSlider.addEventListener('input', () => {
  state.motor.wailPeriod = parseInt(wailSlider.value);
  wailDisplay.textContent = state.motor.wailPeriod + 's';
  sendMotor();
});

// --- Presets ---
function loadPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;

  state.rings = preset.rings.map(r => ({ ...r }));
  Object.assign(state.motor, preset.motor);
  state.motor.running = state.motor.running; // keep current running state
  state.horn = { ...preset.horn };
  state.volume = preset.volume;
  state.selectedRing = 0;
  state.activePreset = key;

  sendConfig();
  sendMotor();
  sendVolume();
  updateHornFilter();
  syncUIFromState();
}

function syncUIFromState() {
  speedSlider.value = state.motor.maxRPM;
  speedDisplay.textContent = state.motor.maxRPM + ' RPM';

  document.querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.motor.mode);
  });

  volumeSlider.value = Math.round(state.volume * 100);
  volumeDisplay.textContent = Math.round(state.volume * 100) + '%';

  // Power slider: reverse the tauUp mapping
  const powerPct = Math.round((1 - (state.motor.tauUp - 1) / 19) * 100);
  powerSlider.value = Math.max(10, Math.min(100, powerPct));
  powerDisplay.textContent = powerSlider.value + '%';

  // Weight slider: reverse the tauDown mapping
  const weightPct = Math.round(((state.motor.tauDown - 2) / 28) * 100);
  weightSlider.value = Math.max(10, Math.min(100, weightPct));
  weightDisplay.textContent = weightSlider.value + '%';

  wailSlider.value = state.motor.wailPeriod;
  wailDisplay.textContent = state.motor.wailPeriod + 's';

  document.getElementById('wail-speed-group').style.display =
    state.motor.mode === 'wail' ? '' : 'none';

  // Horn shape buttons
  document.querySelectorAll('[data-horn]').forEach(b => {
    b.classList.toggle('active', b.dataset.horn === (state.horn.shape || 'wide'));
  });

  btnStart.textContent = state.motor.running ? 'STOP' : 'START';
  btnStart.classList.toggle('running', state.motor.running);

  // Environment controls
  distanceSlider.value = Math.round(state.environment.distance * 100);
  distanceDisplay.textContent = Math.round(state.environment.distance * 100) + '%';
  document.querySelectorAll('.env-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.env === state.environment.preset);
  });

  updateRingUI();
  updatePresetUI();
}

function updatePresetUI() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === state.activePreset);
  });
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
});

// --- Save/Load ---
function getSaves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveSiren(name) {
  const saves = getSaves();
  saves.push({
    version: 1,
    name: name,
    timestamp: Date.now(),
    state: {
      rings: state.rings.map(r => ({ ...r })),
      motor: { ...state.motor },
      horn: { ...state.horn },
      volume: state.volume,
      environment: { ...state.environment },
    },
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

function loadSiren(index) {
  const saves = getSaves();
  if (index < 0 || index >= saves.length) return;
  const save = saves[index];
  state.rings = save.state.rings.map(r => ({ ...r }));
  Object.assign(state.motor, save.state.motor);
  state.horn = { ...save.state.horn };
  state.volume = save.state.volume;
  if (save.state.environment) {
    state.environment = { ...save.state.environment };
  } else {
    state.environment = { distance: 0, preset: 'outdoor' };
  }
  state.selectedRing = 0;
  state.activePreset = null;

  sendConfig();
  sendMotor();
  sendVolume();
  updateHornFilter();
  applyEnvironmentPreset(state.environment.preset);
  syncUIFromState();
}

function deleteSiren(index) {
  const saves = getSaves();
  saves.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

// Save modal
document.getElementById('btn-save').addEventListener('click', () => {
  const saves = getSaves();
  document.getElementById('save-name').value = 'My Siren #' + (saves.length + 1);
  document.getElementById('save-modal').classList.add('open');
});
document.getElementById('save-cancel').addEventListener('click', () => {
  document.getElementById('save-modal').classList.remove('open');
});
document.getElementById('save-confirm').addEventListener('click', () => {
  const name = document.getElementById('save-name').value.trim() || 'My Siren';
  saveSiren(name);
  document.getElementById('save-modal').classList.remove('open');
});

// Load modal
document.getElementById('btn-load').addEventListener('click', () => {
  const saves = getSaves();
  const list = document.getElementById('save-list');
  list.innerHTML = '';

  if (saves.length === 0) {
    list.innerHTML = '<p style="color:#888;text-align:center;padding:16px">No saved sirens yet!</p>';
  } else {
    saves.forEach((save, i) => {
      const div = document.createElement('div');
      div.className = 'save-list-item';
      const date = new Date(save.timestamp).toLocaleDateString();
      div.innerHTML = `
        <div>
          <div class="name">${save.name}</div>
          <div class="date">${date}</div>
        </div>
        <button class="btn-small danger" data-delete="${i}">X</button>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        loadSiren(i);
        document.getElementById('load-modal').classList.remove('open');
      });
      list.appendChild(div);
    });

    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSiren(parseInt(btn.dataset.delete));
        document.getElementById('btn-load').click();
      });
    });
  }

  document.getElementById('load-modal').classList.add('open');
});
document.getElementById('load-cancel').addEventListener('click', () => {
  document.getElementById('load-modal').classList.remove('open');
});

// --- Recording ---
const btnRecord = document.getElementById('btn-record');
btnRecord.addEventListener('click', () => {
  if (!audioReady || !recordDest) return;

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording
    mediaRecorder.stop();
    return;
  }

  // Start recording
  recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
  const options = mimeType ? { mimeType } : {};

  try {
    mediaRecorder = new MediaRecorder(recordDest.stream, options);
  } catch (err) {
    console.error('MediaRecorder init failed:', err);
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const ext = (mediaRecorder.mimeType || '').includes('webm') ? 'webm' : 'ogg';
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    a.download = `Siren-Recording-${timestamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    btnRecord.textContent = 'Record';
    btnRecord.classList.remove('recording');
    mediaRecorder = null;
    recordedChunks = [];
  };

  mediaRecorder.start();
  btnRecord.textContent = 'Stop Rec';
  btnRecord.classList.add('recording');
});

// --- URL sharing ---
function encodeStateToHash() {
  const data = {
    v: 1,
    r: state.rings,
    m: state.motor,
    h: state.horn,
    vol: state.volume,
    env: state.environment,
  };
  return '#config=' + btoa(JSON.stringify(data));
}

function loadFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#config=')) return false;
  try {
    const data = JSON.parse(atob(hash.slice(8)));
    if (data.v !== 1) return false;
    state.rings = data.r.map(r => ({ ...r }));
    Object.assign(state.motor, data.m);
    state.motor.running = false;
    state.horn = { ...data.h };
    state.volume = data.vol;
    if (data.env) {
      state.environment = { ...data.env };
    } else {
      state.environment = { distance: 0, preset: 'outdoor' };
    }
    state.selectedRing = 0;
    state.activePreset = null;
    return true;
  } catch { return false; }
}

document.getElementById('btn-share').addEventListener('click', () => {
  const hash = encodeStateToHash();
  const url = window.location.origin + window.location.pathname + hash;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-share');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
  }).catch(() => {
    prompt('Copy this link:', url);
  });
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
const PRESET_KEYS = Object.keys(PRESETS); // ['thunderbolt', 'city', 'airraid', 'simple']

document.addEventListener('keydown', (e) => {
  // Don't fire shortcuts while the tap overlay is showing
  if (!document.getElementById('tap-overlay').classList.contains('hidden')) return;

  // Don't fire shortcuts while a modal is open
  if (document.querySelector('.modal-overlay.open')) return;

  // Don't fire shortcuts when focus is in a text input
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const key = e.key;

  // Space — Start/Stop toggle
  if (key === ' ') {
    e.preventDefault();
    btnStart.click();
    return;
  }

  // 1/2/3 — Switch mode (Steady/Wail/Alert)
  const modeMap = { '1': 'steady', '2': 'wail', '3': 'alert' };
  if (modeMap[key]) {
    const modeBtn = document.querySelector(`.mode-btn[data-mode="${modeMap[key]}"]`);
    if (modeBtn) modeBtn.click();
    return;
  }

  // Up/Down arrows — Adjust speed (RPM)
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    e.preventDefault();
    const step = parseInt(speedSlider.step) || 50;
    const min = parseInt(speedSlider.min);
    const max = parseInt(speedSlider.max);
    let val = parseInt(speedSlider.value);
    if (key === 'ArrowUp') {
      val = Math.min(max, val + step);
    } else {
      val = Math.max(min, val - step);
    }
    speedSlider.value = val;
    speedSlider.dispatchEvent(new Event('input'));
    return;
  }

  // [ / ] — Cycle through presets
  if (key === '[' || key === ']') {
    let currentIndex = state.activePreset ? PRESET_KEYS.indexOf(state.activePreset) : -1;
    if (key === ']') {
      currentIndex = (currentIndex + 1) % PRESET_KEYS.length;
    } else {
      currentIndex = (currentIndex - 1 + PRESET_KEYS.length) % PRESET_KEYS.length;
    }
    loadPreset(PRESET_KEYS[currentIndex]);
    return;
  }

  // S — Save
  if (key === 's' || key === 'S') {
    document.getElementById('btn-save').click();
    return;
  }

  // L — Load
  if (key === 'l' || key === 'L') {
    document.getElementById('btn-load').click();
    return;
  }
});

// ============================================================
// BUILD MODE
// ============================================================

const tunePanel = document.getElementById('tune-panel');
const buildPanel = document.getElementById('build-panel');

// --- Mode toggle ---
document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const newMode = btn.dataset.appmode;
    if (newMode === state.appMode) return;
    document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchMode(newMode);
  });
});

function switchMode(newMode) {
  const oldMode = state.appMode;
  state.appMode = newMode;

  if (newMode === 'build') {
    // Sync state to assembly (best-effort)
    syncStateToAssembly();
    tunePanel.style.display = 'none';
    buildPanel.style.display = '';
    renderBuildPanel();
  } else {
    // Sync assembly to state
    syncAssemblyToState();
    buildPanel.style.display = 'none';
    tunePanel.style.display = '';
    syncUIFromState();
  }
}

function syncStateToAssembly() {
  // Motor: match by maxRPM
  const bestMotor = PARTS.motors.reduce((best, m) =>
    Math.abs(m.maxRPM - state.motor.maxRPM) < Math.abs(best.maxRPM - state.motor.maxRPM) ? m : best
  );
  state.assembly.motor = { ...bestMotor };

  // Rotor: match by first ring's portCount
  if (state.rings.length > 0) {
    const bestRotor = PARTS.rotors.reduce((best, r) =>
      Math.abs(r.portCount - state.rings[0].portCount) < Math.abs(best.portCount - state.rings[0].portCount) ? r : best
    );
    state.assembly.rotor = { ...bestRotor };
  } else {
    state.assembly.rotor = null;
  }

  // Horn: match by freq
  const bestHorn = PARTS.horns.reduce((best, h) =>
    Math.abs(h.freq - state.horn.freq) < Math.abs(best.freq - state.horn.freq) ? h : best
  );
  state.assembly.horn = { ...bestHorn };
}

function syncAssemblyToState() {
  const asm = state.assembly;
  if (asm.motor) {
    state.motor.maxRPM = asm.motor.maxRPM;
    state.motor.tauUp = asm.motor.tauUp;
  }
  if (asm.rotor) {
    state.motor.tauDown = asm.rotor.tauDown;
    state.rings = [{
      portCount: asm.rotor.portCount,
      portShape: 'rectangular',
      dutyCycle: 0.5,
      enabled: true,
    }];
    state.selectedRing = 0;
  }
  if (asm.horn) {
    state.horn.freq = asm.horn.freq;
    state.horn.Q = asm.horn.Q;
  }
  sendConfig();
  sendMotor();
  updateHornFilter();
}

function getAssemblyMessage() {
  const asm = state.assembly;
  if (!asm.motor && !asm.rotor) return 'Add a motor and rotor to make sound!';
  if (!asm.motor) return 'Add a motor to spin the rotor!';
  if (!asm.rotor) return 'Add a rotor to chop the air!';
  if (!asm.horn) return 'Add a horn to shape the sound! (optional)';
  return 'Your siren is ready! Switch to Tune mode to play.';
}

function renderBuildPanel() {
  let html = '<div class="build-panel">';

  // --- Parts Bin ---
  html += '<div class="parts-bin"><h3>Parts Bin</h3>';

  // Motors
  html += '<div class="parts-section"><div class="parts-section-title">Motors</div><div class="parts-row">';
  for (const m of PARTS.motors) {
    html += `<div class="part-card" draggable="true" data-part-type="motor" data-part-id="${m.id}">
      <span class="part-label">${m.label}</span>
      <span class="part-detail">${m.maxRPM} RPM</span>
    </div>`;
  }
  html += '</div></div>';

  // Rotors
  html += '<div class="parts-section"><div class="parts-section-title">Rotors</div><div class="parts-row">';
  for (const r of PARTS.rotors) {
    html += `<div class="part-card" draggable="true" data-part-type="rotor" data-part-id="${r.id}">
      <span class="part-label">${r.label}</span>
      <span class="part-detail">${r.portCount} holes</span>
    </div>`;
  }
  html += '</div></div>';

  // Horns
  html += '<div class="parts-section"><div class="parts-section-title">Horns</div><div class="parts-row">';
  for (const h of PARTS.horns) {
    html += `<div class="part-card" draggable="true" data-part-type="horn" data-part-id="${h.id}">
      <span class="part-label">${h.label}</span>
      <span class="part-detail">${h.freq} Hz, Q=${h.Q}</span>
    </div>`;
  }
  html += '</div></div>';
  html += '</div>'; // end parts-bin

  // --- Assembly Area ---
  html += '<div class="assembly-area"><h3>Assembly</h3><div class="assembly-slots">';

  // Horn slot (top)
  html += renderSlot('horn', 'Horn', state.assembly.horn);
  // Rotor slot (middle)
  html += renderSlot('rotor', 'Rotor', state.assembly.rotor);
  // Motor slot (bottom)
  html += renderSlot('motor', 'Motor', state.assembly.motor);

  html += '</div>'; // end assembly-slots

  // Message
  html += `<div class="assembly-message">${getAssemblyMessage()}</div>`;

  html += '</div>'; // end assembly-area

  // Clear button
  html += '<div class="build-actions"><button class="btn-clear-assembly" id="btn-clear-assembly">Clear All</button></div>';

  html += '</div>'; // end build-panel

  buildPanel.innerHTML = html;
  bindBuildEvents();
}

function renderSlot(type, label, part) {
  if (part) {
    let detail = '';
    if (type === 'motor') detail = `${part.maxRPM} RPM`;
    else if (type === 'rotor') detail = `${part.portCount} holes`;
    else if (type === 'horn') detail = `${part.freq} Hz, Q=${part.Q}`;

    return `<div class="assembly-slot filled" data-slot-type="${type}">
      <div>
        <div class="slot-part-name">${label}: ${part.label}</div>
        <div class="slot-part-detail">${detail}</div>
      </div>
      <button class="slot-remove" data-remove-slot="${type}">X</button>
    </div>`;
  }
  return `<div class="assembly-slot" data-slot-type="${type}">
    <span class="slot-label">Drop a ${label} here</span>
  </div>`;
}

function bindBuildEvents() {
  // Drag start on part cards
  buildPanel.querySelectorAll('.part-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-siren-part', JSON.stringify({
        type: card.dataset.partType,
        id: card.dataset.partId,
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // Drop on slots
  buildPanel.querySelectorAll('.assembly-slot').forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'copy';
    });

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const raw = e.dataTransfer.getData('application/x-siren-part');
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const slotType = slot.dataset.slotType;
        if (data.type !== slotType) return; // type mismatch
        placePart(slotType, data.id);
      } catch {}
    });
  });

  // Remove buttons
  buildPanel.querySelectorAll('[data-remove-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slotType = btn.dataset.removeSlot;
      state.assembly[slotType] = null;
      syncAssemblyToState();
      renderBuildPanel();
    });
  });

  // Clear all
  const clearBtn = document.getElementById('btn-clear-assembly');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.assembly.motor = null;
      state.assembly.rotor = null;
      state.assembly.horn = null;
      syncAssemblyToState();
      renderBuildPanel();
    });
  }
}

function placePart(type, partId) {
  let partList;
  if (type === 'motor') partList = PARTS.motors;
  else if (type === 'rotor') partList = PARTS.rotors;
  else if (type === 'horn') partList = PARTS.horns;
  else return;

  const part = partList.find(p => p.id === partId);
  if (!part) return;

  state.assembly[type] = { ...part };
  syncAssemblyToState();
  renderBuildPanel();
}
