// Neon Bay's sound: everything is synthesized with WebAudio — a lo-fi sunset
// groove, engine hum, sirens and one-shot effects. No audio files, no network.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let step = 0;

  // A-minor sunset groove: bass line + sparse lead, 96 bpm, 8 steps a bar.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
  const LEAD = [220, 0, 261.63, 0, 329.63, 0, 261.63, 0, 196, 0, 220, 0, 293.66, 0, 329.63, 0];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a sawtooth whose pitch follows speed, through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: two-tone, LFO-driven.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      const sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const sirenLfoGain = ctx.createGain();
      sirenLfoGain.gain.value = 180;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, when, dur, type, vol, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(dest || musicGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  function noiseBurst(when, dur, vol, filterFreq) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(when);
  }

  function musicTick() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const bass = BASS[step % 16];
    if (bass) note(bass, t, 0.28, 'triangle', 0.5);
    const lead = LEAD[step % 16];
    if (lead && step % 2 === 0) note(lead, t, 0.22, 'sine', 0.16);
    if (step % 4 === 2) noiseBurst(t, 0.05, 0.12, 6000); // hat
    step++;
  }

  return {
    /** Call from any user gesture (menu click / key press). Safe to call often. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicTimer) musicTimer = window.setInterval(musicTick, 312); // 96 bpm 8ths
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** speed01: 0..1 of the car's top speed. */
    engine(speed01, on) {
      if (!ctx) return;
      const target = on ? 0.05 + speed01 * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.3);
    },
    shoot() {
      if (!ensure()) return;
      noiseBurst(ctx.currentTime, 0.14, 0.5, 2400);
      note(160, ctx.currentTime, 0.08, 'square', 0.25, master);
    },
    punch() {
      if (!ensure()) return;
      noiseBurst(ctx.currentTime, 0.09, 0.35, 900);
    },
    pickup() {
      if (!ensure()) return;
      note(660, ctx.currentTime, 0.09, 'sine', 0.3, master);
      note(990, ctx.currentTime + 0.08, 0.12, 'sine', 0.3, master);
    },
    crash(strength) {
      if (!ensure()) return;
      noiseBurst(ctx.currentTime, 0.25, Math.min(0.6, 0.2 + strength), 500);
    },
    mission() {
      if (!ensure()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, ctx.currentTime + i * 0.09, 0.22, 'sine', 0.3, master));
    },
    busted() {
      if (!ensure()) return;
      [392, 311, 233].forEach((f, i) => note(f, ctx.currentTime + i * 0.16, 0.3, 'triangle', 0.3, master));
    },
  };
}
