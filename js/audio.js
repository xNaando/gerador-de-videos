// ============================================================
// audio.js — áudio gerado 100% no navegador com Web Audio API:
//  · trilhas musicais procedurais (lo-fi, épica, tensa)
//  · mixagem da narração TTS com ducking automático
//  · saída via MediaStreamDestination → vai para o MediaRecorder
// ============================================================

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// acordes em MIDI por estilo [raiz do baixo, [notas do acorde]]
const CHORDS = {
  lofi: [
    [45, [57, 60, 64, 67]],  // Am7
    [41, [53, 57, 60, 64]],  // Fmaj7
    [48, [60, 64, 67, 71]],  // Cmaj7
    [40, [52, 55, 59, 62]],  // Em7
  ],
  epic: [
    [45, [57, 60, 64]],  // Am
    [41, [53, 57, 60]],  // F
    [48, [60, 64, 67]],  // C
    [43, [55, 59, 62]],  // G
  ],
  dark: [
    [38, [50, 53, 57]],  // Dm
    [34, [46, 50, 53]],  // Bb
    [31, [43, 46, 50]],  // Gm
    [33, [45, 49, 52]],  // A
  ],
};

const STYLES = {
  lofi: { bpm: 76, kick: [0, 2], snare: [1, 3], hats: 'swing', chords: 'pluck', bass: 'sparse', crackle: true, level: 0.16 },
  epic: { bpm: 100, kick: [0, 1, 2, 3], snare: [1, 3], hats: '16th', chords: 'pad', bass: 'pulse', crackle: false, level: 0.14 },
  dark: { bpm: 88, kick: [0, 2.5], snare: [3], hats: 'sparse', chords: 'drone', bass: 'sub', crackle: true, level: 0.13 },
};

let noiseBuffer = null;
function getNoise(ctx) {
  if (!noiseBuffer) {
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// ---------- instrumentos ----------

function kick(ctx, out, t, gain = 0.9) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.11);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + 0.3);
}

function snare(ctx, out, t, gain = 0.5) {
  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  n.connect(f).connect(g).connect(out);
  n.start(t); n.stop(t + 0.2);
}

function hat(ctx, out, t, gain = 0.15) {
  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f).connect(g).connect(out);
  n.start(t); n.stop(t + 0.06);
}

function bassNote(ctx, out, t, freq, dur, gain = 0.3) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function chordPluck(ctx, out, t, freqs, dur = 1.4, gain = 0.07) {
  for (const f of freqs) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(flt).connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

function chordPad(ctx, out, t, freqs, dur, gain = 0.05) {
  for (const f of freqs) {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
      g.gain.setValueAtTime(gain, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(flt).connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
}

function startCrackle(ctx, out, level = 0.008) {
  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  n.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.value = level;
  n.connect(f).connect(g).connect(out);
  n.start();
  return n;
}

// ---------- motor da trilha ----------

// Agenda o groove com lookahead. `voiceSegs` = [{start,end}] em segundos
// relativos ao início do vídeo, usado p/ ducking. Retorna função stop().
export function startMusic(ctx, destNode, styleName, t0, endTime, voiceSegs = []) {
  const cfg = STYLES[styleName];
  if (!cfg) return () => {};

  const musicBus = ctx.createGain();
  musicBus.gain.value = cfg.level;
  musicBus.connect(destNode);

  // ducking: abaixa a música enquanto a narração toca
  const base = cfg.level, ducked = cfg.level * 0.45;
  for (const seg of voiceSegs) {
    const s = t0 + Math.max(0, seg.start - 0.25);
    const e = t0 + seg.end + 0.35;
    musicBus.gain.setValueAtTime(base, s - 0.01);
    musicBus.gain.linearRampToValueAtTime(ducked, s);
    musicBus.gain.setValueAtTime(ducked, e - 0.01);
    musicBus.gain.linearRampToValueAtTime(base, e);
  }

  const barDur = (60 / cfg.bpm) * 4;
  const progression = CHORDS[styleName];
  let bar = 0;
  let crackleSrc = cfg.crackle ? startCrackle(ctx, musicBus) : null;

  function scheduleBar(t, idx) {
    const [root, chord] = progression[idx % progression.length];
    const beat = barDur / 4;

    for (const b of cfg.kick) kick(ctx, musicBus, t + b * beat, styleName === 'epic' ? 1.0 : 0.8);
    for (const b of cfg.snare) snare(ctx, musicBus, t + b * beat, styleName === 'epic' ? 0.6 : 0.4);

    if (cfg.hats === '16th') {
      for (let i = 0; i < 16; i++) hat(ctx, musicBus, t + i * beat / 4, i % 4 === 0 ? 0.14 : 0.08);
    } else if (cfg.hats === 'swing') {
      for (let i = 0; i < 8; i++) {
        const swing = i % 2 === 1 ? beat * 0.09 : 0;
        hat(ctx, musicBus, t + i * beat / 2 + swing, i % 2 === 0 ? 0.12 : 0.07);
      }
    } else {
      for (let i = 0; i < 4; i++) hat(ctx, musicBus, t + i * beat, 0.07);
    }

    const freqs = chord.map(midi);
    if (cfg.chords === 'pluck') {
      chordPluck(ctx, musicBus, t, freqs, 1.6);
      chordPluck(ctx, musicBus, t + 2 * beat, [freqs[1], freqs[2]], 1.2, 0.05);
    } else if (cfg.chords === 'pad') {
      chordPad(ctx, musicBus, t, freqs, barDur, 0.045);
    } else {
      chordPad(ctx, musicBus, t, freqs, barDur * 2, 0.035); // drone atravessa 2 compassos
    }

    const bassFreq = midi(root);
    if (cfg.bass === 'pulse') {
      for (let i = 0; i < 8; i++) bassNote(ctx, musicBus, t + i * beat / 2, bassFreq, beat * 0.4, 0.22);
    } else if (cfg.bass === 'sub') {
      bassNote(ctx, musicBus, t, bassFreq, barDur, 0.3);
    } else {
      bassNote(ctx, musicBus, t, bassFreq, beat * 1.5, 0.25);
      bassNote(ctx, musicBus, t + 2.5 * beat, bassFreq * 1.5, beat, 0.18);
    }
  }

  // lookahead scheduler
  const timer = setInterval(() => {
    const horizon = ctx.currentTime + 0.6;
    while (t0 + bar * barDur < Math.min(horizon, endTime)) {
      scheduleBar(t0 + bar * barDur, bar);
      bar++;
    }
    if (t0 + bar * barDur >= endTime) {
      clearInterval(timer);
      musicBus.gain.setTargetAtTime(0, endTime, 0.4);
      if (crackleSrc) crackleSrc.stop(endTime + 1.5);
    }
  }, 200);

  scheduleBar(t0, bar++); // agenda o primeiro compasso na hora

  return () => {
    clearInterval(timer);
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    if (crackleSrc) { try { crackleSrc.stop(ctx.currentTime + 0.5); } catch {} }
  };
}

// ---------- narração ----------

// Toca os buffers TTS nos offsets definidos; retorna lista de sources.
export function scheduleNarration(ctx, destNode, scenes, t0) {
  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.0;
  // leve compressão p/ voz ficar na frente da música
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  voiceBus.connect(comp).connect(destNode);

  const sources = [];
  for (const sc of scenes) {
    if (!sc.buffer) continue;
    const src = ctx.createBufferSource();
    src.buffer = sc.buffer;
    src.connect(voiceBus);
    src.start(t0 + sc.start);
    sources.push(src);
  }
  return sources;
}
