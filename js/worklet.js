// ============================================================
// AUDIO WORKLET PROCESSOR (inlined as Blob URL)
// ============================================================
const workletCode = `
class SirenProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rpm = 0;
    this.rotorAngle = 0;
    this.time = 0;
    this.running = false;
    this.rings = [];
    this.motor = {
      maxRPM: 3450, mode: 'steady',
      tauUp: 8, tauDown: 12,
      wailPeriod: 10, wailMin: 0.4,
      alertPeriod: 7, alertDuty: 0.5,
      hiloPeriod: 3, attackPeriod: 6,
    };
    this.volume = 0.7;
    this.telemetryCounter = 0;
    this.telemetryInterval = Math.floor(sampleRate * 0.05);
    // Hi-Lo state
    this.hiloTimer = 0;
    this.hiloState = 0;
    // Noise filter state
    this.noisePrev = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'config':
          this.rings = msg.rings || [];
          break;
        case 'motor':
          if (msg.running !== undefined) this.running = msg.running;
          if (msg.maxRPM !== undefined) this.motor.maxRPM = msg.maxRPM;
          if (msg.mode !== undefined) this.motor.mode = msg.mode;
          if (msg.tauUp !== undefined) this.motor.tauUp = msg.tauUp;
          if (msg.tauDown !== undefined) this.motor.tauDown = msg.tauDown;
          if (msg.wailPeriod !== undefined) this.motor.wailPeriod = msg.wailPeriod;
          if (msg.wailMin !== undefined) this.motor.wailMin = msg.wailMin;
          if (msg.alertPeriod !== undefined) this.motor.alertPeriod = msg.alertPeriod;
          if (msg.alertDuty !== undefined) this.motor.alertDuty = msg.alertDuty;
          if (msg.hiloPeriod !== undefined) this.motor.hiloPeriod = msg.hiloPeriod;
          if (msg.attackPeriod !== undefined) this.motor.attackPeriod = msg.attackPeriod;
          break;
        case 'volume':
          this.volume = msg.level;
          break;
      }
    };
  }

  portOverlap(phase, dutyCycle) {
    // phase: 0-1 within one port period, dutyCycle: 0-1
    // Convolution of two rectangular pulses of width dutyCycle
    const w = dutyCycle;
    let d = phase % 1.0;
    if (d < 0) d += 1.0;
    if (d > 0.5) d -= 1.0;
    return Math.max(0, w - Math.abs(d)) / w;
  }

  portOverlapRound(phase, dutyCycle) {
    // Smooth cosine-based overlap for round ports
    let d = phase % 1.0;
    if (d < 0) d += 1.0;
    if (d > 0.5) d -= 1.0;
    const w = dutyCycle * 0.5;
    if (Math.abs(d) >= w) return 0;
    return 0.5 * (1 + Math.cos(Math.PI * d / w));
  }

  getTargetRPM() {
    if (!this.running) return 0;
    const m = this.motor;
    switch (m.mode) {
      case 'steady':
        return m.maxRPM;
      case 'wail': {
        const phase = (this.time % m.wailPeriod) / m.wailPeriod;
        const frac = m.wailMin + (1 - m.wailMin) * 0.5 * (1 - Math.cos(phase * 2 * Math.PI));
        return m.maxRPM * frac;
      }
      case 'alert': {
        const phase = (this.time % m.alertPeriod) / m.alertPeriod;
        return phase < m.alertDuty ? m.maxRPM : 0;
      }
      case 'hilo':
        return m.maxRPM;
      case 'attack': {
        const phase = (this.time % m.attackPeriod) / m.attackPeriod;
        if (phase < 0.3) return m.maxRPM;
        if (phase < 0.5) return m.maxRPM;
        return 0;
      }
      default:
        return m.maxRPM;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;
    const dt = 1 / sampleRate;

    for (let i = 0; i < channel.length; i++) {
      this.time += dt;

      // Motor dynamics
      const target = this.getTargetRPM();
      if (target > this.rpm) {
        this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / this.motor.tauUp));
      } else {
        this.rpm *= Math.exp(-dt / this.motor.tauDown);
        if (this.rpm < 0.5) this.rpm = 0;
      }

      // Advance rotor angle (keep within 0-2PI for float precision)
      const angularVel = this.rpm * 2 * Math.PI / 60;
      this.rotorAngle = (this.rotorAngle + angularVel * dt) % (2 * Math.PI);

      // Hi-Lo timer update (before ring loop)
      if (this.motor.mode === 'hilo' && this.rings.length >= 2) {
        this.hiloTimer += dt;
        if (this.hiloTimer >= this.motor.hiloPeriod) {
          this.hiloTimer = 0;
          this.hiloState = 1 - this.hiloState;
        }
      }

      // Sum ring contributions
      let sample = 0;
      let activeCount = 0;

      for (let r = 0; r < this.rings.length; r++) {
        const ring = this.rings[r];
        if (!ring.enabled) continue;
        // Hi-Lo: only play the active ring
        if (this.motor.mode === 'hilo' && this.rings.length >= 2 && r !== this.hiloState % this.rings.length) continue;
        activeCount++;

        const n = ring.portCount;
        const portPhase = ((n * this.rotorAngle) / (2 * Math.PI)) % 1.0;

        let openness;
        if (ring.portShape === 'round') {
          openness = this.portOverlapRound(portPhase, ring.dutyCycle);
        } else {
          openness = this.portOverlap(portPhase, ring.dutyCycle);
        }

        // Center around 0 for audio signal, weight by ring index
        const weight = 0.8 + 0.2 * (r / Math.max(1, this.rings.length - 1));
        sample += (openness - 0.5) * weight;
      }

      if (activeCount > 0) sample /= activeCount;

      // Amplitude envelope based on RPM
      const rpmFrac = this.rpm / Math.max(1, this.motor.maxRPM);
      const ampEnv = Math.pow(rpmFrac, 1.5);
      sample *= ampEnv;

      // Turbulence noise layer (subtle air whoosh, not audible fuzz)
      const noiseRaw = (Math.random() * 2 - 1) * 0.04 * Math.pow(rpmFrac, 2.0);
      this.noisePrev += 0.08 * (noiseRaw - this.noisePrev);
      sample += this.noisePrev;

      // Volume and soft clip
      sample *= this.volume;
      sample = Math.tanh(sample * 2.0);

      channel[i] = sample;
    }

    // Stereo: copy to other channels
    for (let c = 1; c < output.length; c++) {
      output[c].set(channel);
    }

    // Telemetry
    this.telemetryCounter += channel.length;
    if (this.telemetryCounter >= this.telemetryInterval) {
      this.port.postMessage({ type: 'telemetry', rpm: this.rpm });
      this.telemetryCounter = 0;
    }

    return true;
  }
}

registerProcessor('siren-processor', SirenProcessor);
`;
