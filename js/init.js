// ============================================================
// INITIALIZATION
// ============================================================
const tapOverlay = document.getElementById('tap-overlay');

tapOverlay.addEventListener('click', async () => {
  tapOverlay.classList.add('hidden');
  await initAudio();
  if (loadFromHash()) {
    sendConfig();
    sendMotor();
    sendVolume();
    updateHornFilter();
    applyEnvironmentPreset(state.environment.preset);
    updateDistance(state.environment.distance);
  }
  syncUIFromState();
  setupCanvas();
  setupWaveformCanvas();
  requestAnimationFrame(drawSiren);
});

window.addEventListener('resize', () => {
  if (audioReady) {
    setupCanvas();
    setupWaveformCanvas();
  }
});
