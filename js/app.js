// ============================================================
// app.js — orquestra o pipeline:
//   ideia → roteiro (LLM) → imagens IA + narração TTS
//   → gravação Canvas+Áudio (MediaRecorder) → download
// ============================================================

import { generateScript, loadImageWithRetry, loadOpenverseImage, fetchTTSAudio } from './api.js';
import { startMusic, scheduleNarration } from './audio.js';
import { VideoRenderer } from './renderer.js';

const $ = (id) => document.getElementById(id);

const els = {
  topic: $('topic'), voice: $('voice'), style: $('style'),
  music: $('music'), scenes: $('scenes'), generate: $('generate'),
  progress: $('progress'), progressFill: $('progress-fill'), steps: $('steps'),
  errorBox: $('error-box'), stage: $('stage'), overlay: $('preview-overlay'),
  result: $('result'), resultVideo: $('result-video'), download: $('download'),
  regen: $('regen'), caption: $('caption-text'), copyCaption: $('copy-caption'),
  formatNote: $('format-note'),
};

const STEP_DEFS = [
  ['script', '✍️ Escrevendo o roteiro'],
  ['assets', '🎨 Gerando imagens e narração'],
  ['record', '🎥 Gravando o vídeo'],
  ['done', '✅ Pronto!'],
];

let audioCtx = null;
let currentRecorder = null;
let rafId = null;
let running = false;

// ---------- UI: passos ----------

function renderSteps(activeId) {
  const activeIdx = STEP_DEFS.findIndex(([id]) => id === activeId);
  els.steps.innerHTML = STEP_DEFS.map(([id, label], i) => {
    let cls = '', icon = '○';
    if (i < activeIdx) { cls = 'done'; icon = '✓'; }
    else if (i === activeIdx) { cls = 'active'; icon = '<span class="spinner"></span>'; }
    return `<li class="${cls}">${icon} ${label}</li>`;
  }).join('');
}

function setProgress(p) {
  els.progressFill.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
}

function showError(msg) {
  els.errorBox.textContent = `❌ ${msg}`;
  els.errorBox.classList.remove('hidden');
}

// ---------- pipeline ----------

async function buildScenes(script, nScenes, voiceIdx, style, onItem) {
  const scenes = script.scenes.slice(0, nScenes);
  const seedBase = Math.floor(Math.random() * 999999);
  const totalItems = scenes.length * 2;
  let done = 0;
  const tick = () => onItem(++done / totalItems);

  await Promise.all(scenes.map(async (sc, i) => {
    const ttsP = voiceIdx > 0 && sc.narration
      ? fetchTTSAudio(sc.narration, voiceIdx, audioCtx)
          .catch(e => { console.warn(`TTS cena ${i} falhou:`, e); return null; })
          .then(b => { sc.buffer = b; tick(); })
      : Promise.resolve(tick());

    // Pollinations (IA) → Openverse (foto real) → gradiente
    const imgP = loadImageWithRetry(sc.image_prompt, style, seedBase + i, 3, i * 2500)
      .then(async (img) => {
        if (!img) img = await loadOpenverseImage(sc.search || sc.image_prompt);
        sc.image = img;
        tick();
      });

    await Promise.all([ttsP, imgP]);
  }));

  // timeline: duração da cena = áudio + respiro (ou 4.2s sem voz)
  let cursor = 0.35;
  scenes.forEach(sc => {
    sc.voiceDur = sc.buffer ? sc.buffer.duration : 4.2;
    const d = sc.buffer ? sc.buffer.duration + 0.55 : 4.2;
    sc.start = cursor;
    sc.end = cursor + d;
    cursor = sc.end;
  });
  return { scenes, total: cursor + 0.45 };
}

// frame de espera desenhado no canvas enquanto os assets carregam
function drawIdleFrame(canvas, label) {
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 720, 1280);
  g.addColorStop(0, '#1a1030');
  g.addColorStop(1, '#0c0c18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 720, 1280);
  ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, 360, 640);
}

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

async function recordVideo(scenes, total, musicStyle) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Seu navegador não suporta gravação de vídeo (MediaRecorder).');
  }

  const dest = audioCtx.createMediaStreamDestination();
  const stream = new MediaStream([
    ...els.stage.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const renderer = new VideoRenderer(els.stage, scenes, audioCtx);
  renderer.draw(0); // frame 1: o que o encoder já começa a receber

  // isTypeSupported mente em alguns navegadores: aqui cada codec grava
  // ~1.2s de verdade e só vence quem não disparar erro (sync ou async).
  let rec = null, usedMime = '', chunks = [];
  for (const mime of [...MIME_CANDIDATES, null]) {
    if (mime && !MediaRecorder.isTypeSupported(mime)) continue;
    const opts = { videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 };
    if (mime) opts.mimeType = mime;

    let candidate;
    try { candidate = new MediaRecorder(stream, opts); }
    catch (e) { console.warn(`recorder ${mime || 'padrão'} falhou ao criar:`, e); continue; }

    const myChunks = [];
    candidate.ondataavailable = (e) => { if (e.data.size) myChunks.push(e.data); };
    try {
      await new Promise((res, rej) => {
        candidate.onerror = (e) => rej(e.error || new Error('encoder'));
        candidate.start(400);
        setTimeout(res, 1200);
      });
      rec = candidate; usedMime = mime; chunks = myChunks;
      rec.onerror = null;
      break;
    } catch (e) {
      console.warn(`encoder rejeitou ${mime || 'padrão'}:`, e && e.message || e);
      try { candidate.stop(); } catch {}
    }
  }

  if (!rec) throw new Error('Nenhum codec de vídeo funcionou neste navegador.');
  console.log('[codec]', usedMime || rec.mimeType, '|', navigator.userAgent);
  currentRecorder = rec;

  return new Promise((resolve, reject) => {
    rec.onerror = (e) => reject(e.error || new Error('falha na gravação'));
    rec.onstop = () => {
      const type = usedMime || rec.mimeType || 'video/webm';
      resolve({ blob: new Blob(chunks, { type }), mime: type });
    };

    const voiceSegs = scenes.filter(s => s.buffer)
      .map(s => ({ start: s.start, end: s.start + s.buffer.duration }));

    const t0 = audioCtx.currentTime + 0.15;
    scheduleNarration(audioCtx, dest, scenes, t0);
    const stopMusic = startMusic(audioCtx, dest, musicStyle, t0, t0 + total, voiceSegs);

    els.overlay.classList.add('hidden');

    const frame = () => {
      const t = audioCtx.currentTime - t0;
      renderer.draw(Math.max(0, t));
      setProgress(0.55 + 0.45 * Math.max(0, t / total));
      if (t >= total) {
        stopMusic();
        rec.stop();
        return;
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  });
}

async function run() {
  const topic = els.topic.value.trim();
  if (!topic) { showError('Digite sobre o que é o vídeo.'); return; }
  if (running) return;
  running = true;

  els.generate.disabled = true;
  els.errorBox.classList.add('hidden');
  els.result.classList.add('hidden');
  els.progress.classList.remove('hidden');
  setProgress(0.03);

  // AudioContext precisa nascer no gesto do usuário p/ não ficar suspenso
  if (!audioCtx) audioCtx = new AudioContext();
  await audioCtx.resume();

  const voiceIdx = Number(els.voice.value);
  const style = els.style.value;
  const music = els.music.value;
  const nScenes = Number(els.scenes.value);

  try {
    // 1. roteiro
    renderSteps('script');
    const script = await generateScript(topic, style, nScenes);
    setProgress(0.2);

    // 2. assets (imagens + TTS) em paralelo
    renderSteps('assets');
    els.overlay.classList.add('hidden');
    drawIdleFrame(els.stage, 'Gerando cenas...');
    const { scenes, total } = await buildScenes(script, nScenes, voiceIdx, style, (frac) => {
      setProgress(0.2 + 0.35 * frac);
      drawIdleFrame(els.stage, `Gerando cenas... ${Math.round(frac * 100)}%`);
    });

    // 3. gravação
    renderSteps('record');
    const { blob, mime } = await recordVideo(scenes, total, music);

    // 4. resultado
    renderSteps('done');
    setProgress(1);
    showResult(blob, mime, script);
  } catch (e) {
    console.error(e);
    showError(`Algo deu errado: ${e.message}. Tente novamente.`);
    els.overlay.classList.remove('hidden');
  } finally {
    running = false;
    els.generate.disabled = false;
  }
}

function showResult(blob, mime, script) {
  const url = URL.createObjectURL(blob);
  const isMp4 = mime.includes('mp4');
  els.resultVideo.src = url;
  els.download.href = url;
  els.download.download = `video-ia.${isMp4 ? 'mp4' : 'webm'}`;

  const tags = (script.hashtags || []).join(' ');
  els.caption.textContent = `${script.caption || ''}\n\n${tags}`.trim();

  els.formatNote.textContent = isMp4
    ? 'Formato MP4 — pronto pra postar no TikTok e Instagram.'
    : 'Formato WebM — o TikTok aceita direto. Para o Instagram, converta para MP4 (ex: cloudconvert.com).';

  els.result.classList.remove('hidden');
  els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- eventos ----------

els.generate.addEventListener('click', run);

els.regen.addEventListener('click', () => {
  els.result.classList.add('hidden');
  els.progress.classList.add('hidden');
  els.overlay.classList.remove('hidden');
  if (els.resultVideo.src) URL.revokeObjectURL(els.resultVideo.src);
  els.resultVideo.removeAttribute('src');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

els.copyCaption.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.caption.textContent);
  els.copyCaption.textContent = 'Copiado!';
  setTimeout(() => { els.copyCaption.textContent = 'Copiar'; }, 1500);
});
