// ============================================================
// CANVAS - ROTOR EDITOR
// ============================================================
const canvas = document.getElementById('rotor-canvas');
const ctx = canvas.getContext('2d');
let animAngle = 0;
let lastAnimTime = 0;

// Sound wave animation state
let soundWaves = [];
let lastWaveSpawn = 0;
let nextColorIndex = 0;

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- Waveform / Spectrum visualizer ---
const wfCanvas = document.getElementById('waveform-canvas');
const wfCtx = wfCanvas.getContext('2d');

function setupWaveformCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = wfCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  wfCanvas.width = w * dpr;
  wfCanvas.height = h * dpr;
  wfCanvas.style.width = w + 'px';
  wfCanvas.style.height = h + 'px';
  wfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawWaveform() {
  if (!analyser) return;

  const rect = wfCanvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  wfCtx.clearRect(0, 0, W, H);

  if (vizMode === 'wave') {
    // --- Waveform (oscilloscope) mode ---
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);

    wfCtx.lineWidth = 2;
    wfCtx.strokeStyle = '#4ECDC4'; // cyan/green
    wfCtx.beginPath();

    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128.0; // 0-2 range, 1 = center
      const y = (v * H) / 2;
      if (i === 0) {
        wfCtx.moveTo(x, y);
      } else {
        wfCtx.lineTo(x, y);
      }
      x += sliceW;
    }
    wfCtx.lineTo(W, H / 2);
    wfCtx.stroke();

    // Draw center line (dim)
    wfCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    wfCtx.lineWidth = 1;
    wfCtx.beginPath();
    wfCtx.moveTo(0, H / 2);
    wfCtx.lineTo(W, H / 2);
    wfCtx.stroke();
  } else {
    // --- Frequency spectrum (bar graph) mode ---
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);

    // Use a subset of bins for visual clarity (lower frequencies are more interesting)
    const barCount = Math.min(64, bufLen);
    const barW = W / barCount;

    for (let i = 0; i < barCount; i++) {
      // Map bar index to frequency bin (logarithmic-ish spread for lower frequencies)
      const binIndex = Math.floor((i / barCount) * bufLen * 0.5);
      const val = data[binIndex] / 255;
      const barH = val * H;

      // Cycle through RING_COLORS for the bars
      const color = RING_COLORS[i % RING_COLORS.length];

      wfCtx.fillStyle = color;
      wfCtx.globalAlpha = 0.6 + val * 0.4;
      wfCtx.fillRect(i * barW + 1, H - barH, barW - 2, barH);
    }
    wfCtx.globalAlpha = 1.0;
  }
}

// Stored layout rects for click detection
let ringBands = [];

function drawSiren(time) {
  if (!lastAnimTime) lastAnimTime = time;
  const dt = (time - lastAnimTime) / 1000;
  lastAnimTime = time;

  const angularVel = state.currentRPM * 2 * Math.PI / 60;
  animAngle += angularVel * dt;

  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const wavePad = 60;
  const pad = 16;
  const innerW = W - pad * 2;
  const rpmFrac = state.currentRPM / Math.max(1, state.motor.maxRPM);
  const isRunning = state.motor.running && state.currentRPM > 1;
  const ringsCount = Math.max(1, state.rings.length);
  const fontFamily = getComputedStyle(document.body).fontFamily;

  ctx.clearRect(0, 0, W, H);

  // === LAYOUT ===
  const hornH = H * 0.11;
  const motorH = H * 0.13;
  const shaftH = H * 0.08;
  const statorCapH = 6;
  const basePlateH = 6;
  const ringAreaH = H - hornH - statorCapH - basePlateH - shaftH - motorH - wavePad - pad;
  const ringTotalH = ringAreaH / ringsCount;
  const statorRowH = ringTotalH * 0.35;
  const rotorRowH = ringTotalH * 0.35;
  const ringGapH = ringTotalH * 0.3;

  let y = wavePad;

  // === SOUND WAVES (drawn before horn so they appear behind it) ===
  {
    // Determine active rings and compute average frequency
    const activeRings = state.rings
      .map((r, i) => ({ ring: r, index: i }))
      .filter(r => r.ring.enabled);

    if (isRunning && activeRings.length > 0) {
      const avgFreq = activeRings.reduce((sum, r) => sum + r.ring.portCount * state.currentRPM / 60, 0) / activeRings.length;

      // Spawn new waves at a rate proportional to frequency
      // Use a multiplier so waves don't spawn too rapidly
      const spawnInterval = 1000 / (avgFreq * 0.15);
      if (time - lastWaveSpawn > spawnInterval) {
        const colorIdx = activeRings[nextColorIndex % activeRings.length].index;
        soundWaves.push({ age: 0, maxAge: 1.0, colorIndex: colorIdx });
        nextColorIndex++;
        lastWaveSpawn = time;
      }
    }

    // Update wave ages and remove expired ones
    for (let i = soundWaves.length - 1; i >= 0; i--) {
      soundWaves[i].age += dt;
      if (soundWaves[i].age > soundWaves[i].maxAge) {
        soundWaves.splice(i, 1);
      }
    }

    // Clear waves when siren stops
    if (!isRunning && soundWaves.length > 0) {
      // Let existing waves fade out naturally (they'll be removed above)
    }

    // Draw sound waves as arcs emanating from horn mouth
    const waveCx = W / 2;
    const waveCy = wavePad + 3;
    const maxRadius = wavePad + 20;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, wavePad + 6);
    ctx.clip();

    for (const wave of soundWaves) {
      const progress = wave.age / wave.maxAge;
      const radius = progress * maxRadius;
      const alpha = (1 - progress) * rpmFrac;
      const color = RING_COLORS[wave.colorIndex % RING_COLORS.length];
      const lw = 2 + rpmFrac * 3;

      if (alpha <= 0) continue;

      ctx.beginPath();
      ctx.arc(waveCx, waveCy, radius, Math.PI, 0);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // === HORN (shape-dependent) ===
  const hornShape = state.horn.shape || 'wide';

  if (hornShape !== 'none') {
    let hornTopW, hornBotW;

    if (hornShape === 'narrow') {
      hornTopW = innerW * 0.5;
      hornBotW = innerW * 0.35;
    } else if (hornShape === 'wide') {
      hornTopW = innerW * 0.95;
      hornBotW = innerW * 0.3;
    } else if (hornShape === 'rectangular') {
      hornTopW = innerW * 0.6;
      hornBotW = innerW * 0.6;
    } else {
      hornTopW = innerW * 0.9;
      hornBotW = innerW * 0.45;
    }

    const hornGrad = ctx.createLinearGradient(0, y, 0, y + hornH);
    hornGrad.addColorStop(0, '#8B7355');
    hornGrad.addColorStop(0.5, '#A08060');
    hornGrad.addColorStop(1, '#6B5540');

    ctx.beginPath();
    if (hornShape === 'wide') {
      // Flared bell with slight curve
      const lTop = pad + (innerW - hornTopW) / 2;
      const rTop = pad + (innerW + hornTopW) / 2;
      const lBot = pad + (innerW - hornBotW) / 2;
      const rBot = pad + (innerW + hornBotW) / 2;
      ctx.moveTo(lTop, y);
      ctx.lineTo(rTop, y);
      ctx.quadraticCurveTo(rBot + (rTop - rBot) * 0.3, y + hornH * 0.7, rBot, y + hornH);
      ctx.lineTo(lBot, y + hornH);
      ctx.quadraticCurveTo(lBot - (lBot - lTop) * 0.3, y + hornH * 0.7, lTop, y);
    } else {
      // Straight-sided trapezoid (narrow, rectangular, or fallback)
      ctx.moveTo(pad + (innerW - hornTopW) / 2, y);
      ctx.lineTo(pad + (innerW + hornTopW) / 2, y);
      ctx.lineTo(pad + (innerW + hornBotW) / 2, y + hornH);
      ctx.lineTo(pad + (innerW - hornBotW) / 2, y + hornH);
    }
    ctx.closePath();
    ctx.fillStyle = hornGrad;
    ctx.fill();
    ctx.strokeStyle = '#9B8365';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Horn opening (dark inside)
    const openW = hornTopW * 0.75;
    const openBotW = hornBotW * 0.5;
    ctx.beginPath();
    if (hornShape === 'wide') {
      const lTop = pad + (innerW - openW) / 2;
      const rTop = pad + (innerW + openW) / 2;
      const lBot = pad + (innerW - openBotW) / 2;
      const rBot = pad + (innerW + openBotW) / 2;
      ctx.moveTo(lTop, y + 3);
      ctx.lineTo(rTop, y + 3);
      ctx.quadraticCurveTo(rBot + (rTop - rBot) * 0.3, y + hornH * 0.65, rBot, y + hornH - 2);
      ctx.lineTo(lBot, y + hornH - 2);
      ctx.quadraticCurveTo(lBot - (lBot - lTop) * 0.3, y + hornH * 0.65, lTop, y + 3);
    } else {
      ctx.moveTo(pad + (innerW - openW) / 2, y + 3);
      ctx.lineTo(pad + (innerW + openW) / 2, y + 3);
      ctx.lineTo(pad + (innerW + openBotW) / 2, y + hornH - 2);
      ctx.lineTo(pad + (innerW - openBotW) / 2, y + hornH - 2);
    }
    ctx.closePath();
    ctx.fillStyle = '#1a1210';
    ctx.fill();

    // Label
    const shapeLabel = HORN_SHAPES[hornShape] ? HORN_SHAPES[hornShape].label : 'HORN';
    ctx.fillStyle = '#c0a080';
    ctx.font = `bold 10px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(shapeLabel.toUpperCase(), W / 2, y + hornH - 8);
  }

  y += hornH;

  // === STATOR CAP (thin plate connecting horn to assembly) ===
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(pad, y, innerW, statorCapH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, y, innerW, statorCapH);
  y += statorCapH;

  // === PORT ASSEMBLY (stator + rotor bands per ring) ===
  ringBands = [];
  const assemblyX = pad;
  const assemblyW = innerW;

  for (let i = 0; i < state.rings.length; i++) {
    const ring = state.rings[i];
    const color = RING_COLORS[i % RING_COLORS.length];
    const bandY = y + i * ringTotalH;
    const gapBefore = ringGapH * 0.15;

    // Store for click detection
    ringBands.push({ y: bandY, h: ringTotalH, index: i });

    // Selected highlight background
    if (i === state.selectedRing) {
      ctx.fillStyle = color + '15';
      ctx.fillRect(assemblyX, bandY, assemblyW, statorRowH + rotorRowH + gapBefore * 2);
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 2;
      ctx.strokeRect(assemblyX, bandY, assemblyW, statorRowH + rotorRowH + gapBefore * 2);
    }

    // --- STATOR ROW (fixed ports) ---
    const statorY = bandY + gapBefore;
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(assemblyX, statorY, assemblyW, statorRowH);

    // Draw stator port pattern (fixed)
    if (ring.enabled) {
      drawPortBand(ctx, assemblyX, statorY, assemblyW, statorRowH,
        ring.portCount, ring.statorDutyCycle, ring.portShape, 0, '#4a4a6a', color + '30');
    }

    // Shutter overlay on stator
    if (!ring.shutterOpen) {
      ctx.fillStyle = 'rgba(40, 40, 55, 0.75)';
      ctx.fillRect(assemblyX, statorY, assemblyW, statorRowH);
    }

    // Stator label
    ctx.fillStyle = '#666';
    ctx.font = `9px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(ring.shutterOpen ? 'STATOR' : 'SHUT', assemblyX + 4, statorY + statorRowH - 3);

    // --- ROTOR ROW (scrolling ports) ---
    const rotorY = statorY + statorRowH + 2;
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(assemblyX, rotorY, assemblyW, rotorRowH);

    if (ring.enabled) {
      const scrollOffset = (animAngle / (2 * Math.PI)) * assemblyW;
      drawPortBand(ctx, assemblyX, rotorY, assemblyW, rotorRowH,
        ring.portCount, ring.rotorDutyCycle, ring.portShape, scrollOffset, '#1e1e2e', color);

      // Glow on rotor when running
      if (isRunning) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 4 + rpmFrac * 8;
        ctx.strokeStyle = color + '60';
        ctx.lineWidth = 1;
        ctx.strokeRect(assemblyX, rotorY, assemblyW, rotorRowH);
        ctx.restore();
      }
    }

    // Rotor label
    ctx.fillStyle = '#888';
    ctx.font = `9px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('ROTOR', assemblyX + 4, rotorY + rotorRowH - 3);

    // Ring number + port count label on right
    ctx.fillStyle = color;
    ctx.font = `bold 11px ${fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(`Ring ${i + 1}: ${ring.portCount} ports`, assemblyX + assemblyW - 4, statorY + statorRowH / 2 + 4);

    // Air flow indicators between stator and rotor
    if (ring.enabled && isRunning) {
      drawAirFlow(ctx, assemblyX, statorY, assemblyW, statorRowH, rotorRowH,
        ring.portCount, ring.statorDutyCycle, ring.rotorDutyCycle, animAngle, color, rpmFrac);
    }

    // Divider between rings
    if (i < state.rings.length - 1) {
      const divY = bandY + statorRowH + rotorRowH + gapBefore * 2 + ringGapH * 0.3;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(assemblyX + 10, divY);
      ctx.lineTo(assemblyX + assemblyW - 10, divY);
      ctx.stroke();
    }
  }

  y += ringAreaH;

  // === BASE PLATE ===
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(pad, y, innerW, basePlateH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, y, innerW, basePlateH);
  y += basePlateH;

  // === SHAFT ===
  const shaftW = 14;
  const shaftX = W / 2 - shaftW / 2;
  const shaftGrad = ctx.createLinearGradient(shaftX, 0, shaftX + shaftW, 0);
  shaftGrad.addColorStop(0, '#555');
  shaftGrad.addColorStop(0.5, '#888');
  shaftGrad.addColorStop(1, '#555');
  ctx.fillStyle = shaftGrad;
  ctx.fillRect(shaftX, y, shaftW, shaftH);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(shaftX, y, shaftW, shaftH);
  y += shaftH;

  // === MOTOR ===
  const motorW = innerW * 0.55;
  const motorX = pad + (innerW - motorW) / 2;
  const motorGrad = ctx.createLinearGradient(0, y, 0, y + motorH);
  motorGrad.addColorStop(0, '#3a3a4a');
  motorGrad.addColorStop(0.5, '#2e2e3e');
  motorGrad.addColorStop(1, '#252535');
  ctx.fillStyle = motorGrad;
  roundRect(ctx, motorX, y, motorW, motorH, 6);
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  roundRect(ctx, motorX, y, motorW, motorH, 6);
  ctx.stroke();

  // Motor spinning indicator
  const motorCx = W / 2;
  const motorCy = y + motorH / 2;
  const motorR = Math.min(motorW, motorH) * 0.25;
  ctx.strokeStyle = isRunning ? '#FF9800' : '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(motorCx, motorCy, motorR, 0, Math.PI * 2);
  ctx.stroke();

  // Spinning spokes
  const spokeCount = 4;
  for (let s = 0; s < spokeCount; s++) {
    const angle = (s / spokeCount) * Math.PI * 2 + (isRunning ? animAngle * 0.5 : 0);
    ctx.beginPath();
    ctx.moveTo(motorCx, motorCy);
    ctx.lineTo(motorCx + motorR * Math.cos(angle), motorCy + motorR * Math.sin(angle));
    ctx.strokeStyle = isRunning ? '#FF9800' : '#444';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Motor label
  ctx.fillStyle = '#888';
  ctx.font = `bold 10px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText('MOTOR', motorCx, y + motorH - 6);

  // === RPM bar ===
  const rpmBar = document.getElementById('rpm-bar');
  const rpmLabel = document.getElementById('rpm-label');
  rpmBar.style.width = Math.min(100, rpmFrac * 100) + '%';
  rpmLabel.textContent = Math.round(state.currentRPM) + ' RPM';

  // === Live frequency display ===
  const freqDisplay = document.getElementById('freq-display');
  let freqHTML = '';
  for (let i = 0; i < state.rings.length; i++) {
    const ring = state.rings[i];
    if (!ring.enabled) continue;
    const freq = Math.round(ring.portCount * state.currentRPM / 60);
    const color = RING_COLORS[i % RING_COLORS.length];
    freqHTML += `<span class="freq-chip" style="background:${color}55;border:1px solid ${color}">${freq} Hz</span>`;
  }
  freqDisplay.innerHTML = freqHTML;

  // Draw waveform/spectrum visualizer
  drawWaveform();

  requestAnimationFrame(drawSiren);
}

function drawPortBand(ctx, x, y, w, h, portCount, dutyCycle, shape, scrollOffset, bgColor, portColor) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const period = w / portCount;
  const portW = period * dutyCycle;
  const startOffset = -(scrollOffset % period) - period;

  for (let px = startOffset; px < w + period; px += period) {
    const drawX = x + px;
    const drawW = portW;

    if (shape === 'round') {
      const cx = drawX + drawW / 2;
      const cy = y + h / 2;
      const r = Math.min(drawW, h - 4) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = portColor;
      ctx.fill();
    } else {
      ctx.fillStyle = portColor;
      ctx.fillRect(drawX + 1, y + 2, drawW - 2, h - 4);
    }
  }

  ctx.restore();
}

function drawAirFlow(ctx, x, statorY, w, statorH, rotorH, portCount, statorDuty, rotorDuty, angle, color, rpmFrac) {
  if (rpmFrac < 0.05) return;
  const period = w / portCount;
  const statorPortW = period * statorDuty;
  const rotorPortW = period * rotorDuty;
  const rotorOffset = (angle / (2 * Math.PI)) * w;
  const flowY = statorY + statorH;
  const flowH = 2;
  const overlapW = Math.min(statorPortW, rotorPortW);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, flowY, w, flowH);
  ctx.clip();
  ctx.globalAlpha = rpmFrac * 0.6;

  for (let i = 0; i < portCount * 2; i++) {
    const statorPortX = i * period;
    const rotorPortX = (i * period + rotorOffset) % (w + period);

    const statorCenter = statorPortX + statorPortW / 2;
    const rotorCenter = rotorPortX + rotorPortW / 2;
    for (let rp = -w; rp <= w; rp += w) {
      const diff = Math.abs(statorCenter - (rotorCenter + rp));
      if (diff < (statorPortW + rotorPortW) / 2 * 0.7) {
        const fx = x + statorPortX;
        ctx.fillStyle = color;
        ctx.fillRect(fx, flowY, overlapW, flowH);
        break;
      }
    }
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Canvas click → select ring by clicking on its band
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickY = e.clientY - rect.top;

  for (const band of ringBands) {
    if (clickY >= band.y && clickY <= band.y + band.h) {
      state.selectedRing = band.index;
      updateRingUI();
      return;
    }
  }
});
