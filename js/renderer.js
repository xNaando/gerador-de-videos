// ============================================================
// renderer.js — desenha o vídeo 720x1280 (9:16) no canvas:
//  · imagens IA com efeito Ken Burns + crossfade entre cenas
//  · legendas estilo karaoke sincronizadas com a narração
//  · headline por cena, barra de progresso, partículas, vinheta
// ============================================================

const W = 720, H = 1280;

// divide a narração em grupos de ~3 palavras p/ legenda karaoke
function chunkWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(' '));
  }
  return chunks.length ? chunks : [''];
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class VideoRenderer {
  constructor(canvas, scenes, audioCtx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scenes = scenes;
    this.audioCtx = audioCtx;
    this.total = scenes.length ? scenes[scenes.length - 1].end : 0;
    this.particles = Array.from({ length: 26 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 1 + Math.random() * 2.5, s: 8 + Math.random() * 20,
      o: 0.15 + Math.random() * 0.35,
    }));
    // pré-computa chunks de legenda por cena
    for (const sc of scenes) {
      sc.chunks = chunkWords(sc.narration || sc.subtitle || '');
      const totalChars = sc.chunks.reduce((a, c) => a + c.length, 0) || 1;
      let acc = 0;
      sc.chunkTimes = sc.chunks.map(c => {
        const start = acc / totalChars;
        acc += c.length;
        return { start, end: acc / totalChars, text: c };
      });
    }
  }

  sceneAt(t) {
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      if (t >= this.scenes[i].start) return i;
    }
    return 0;
  }

  drawImageCover(img, localT, dur, idx) {
    const ctx = this.ctx;
    const p = Math.min(1, Math.max(0, localT / dur));
    // Ken Burns alternado: zoom in / zoom out com pan sutil
    const zoomIn = idx % 2 === 0;
    const scale = zoomIn ? 1.06 + p * 0.10 : 1.16 - p * 0.10;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cover = Math.max(W / iw, H / ih) * scale;
    const dw = iw * cover, dh = ih * cover;
    const panX = (zoomIn ? -1 : 1) * (p - 0.5) * 40;
    const panY = (idx % 3 === 0 ? 1 : -1) * (p - 0.5) * 30;
    ctx.drawImage(img, (W - dw) / 2 + panX, (H - dh) / 2 + panY, dw, dh);
  }

  // vídeo real: cover 9:16 + zoom lento p/ cortes parecerem dirigidos
  drawVideoCover(v, localT, dur) {
    const ctx = this.ctx;
    const p = Math.min(1, Math.max(0, localT / dur));
    const iw = v.videoWidth || 720, ih = v.videoHeight || 1280;
    const cover = Math.max(W / iw, H / ih) * (1 + p * 0.05);
    const dw = iw * cover, dh = ih * cover;
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  drawSceneMedia(scene, localT, dur, idx, t) {
    if (scene.video && scene.video.readyState >= 2) this.drawVideoCover(scene.video, localT, dur);
    else if (scene.image) this.drawImageCover(scene.image, localT, dur, idx);
    else this.drawGradientBG(t + idx * 7);
  }

  drawGradientBG(localT) {
    const ctx = this.ctx;
    const hue = (localT * 30) % 360;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${(hue + 260) % 360}, 70%, 22%)`);
    g.addColorStop(1, `hsl(${(hue + 190) % 360}, 70%, 12%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawOverlays() {
    const ctx = this.ctx;
    // escurece topo e base p/ texto legível
    let g = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.35);
    g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    // vinheta lateral suave
    g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawParticles(t) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const y = (p.y - t * p.s) % H;
      ctx.globalAlpha = p.o;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, y < 0 ? y + H : y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawProgress(t) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, W, 6);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#8b5cf6');
    g.addColorStop(1, '#ec4899');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W * Math.min(1, t / this.total), 6);
  }

  drawHeadline(scene, localT) {
    if (!scene.subtitle) return;
    const ctx = this.ctx;
    // animação pop-in nos primeiros 0.5s
    const p = Math.min(1, localT / 0.5);
    const ease = 1 - Math.pow(1 - p, 3);
    const scale = 0.7 + 0.3 * ease;

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(W / 2, H * 0.20);
    ctx.scale(scale, scale);
    ctx.font = '900 58px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, scene.subtitle, W * 0.84);
    const lh = 66;
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lh;
      ctx.lineWidth = 14;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(line, 0, y);
      const g = ctx.createLinearGradient(-200, y - 30, 200, y + 30);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#e9d5ff');
      ctx.fillStyle = g;
      ctx.fillText(line, 0, y);
    });
    ctx.restore();
  }

  drawCaptions(scene, localT) {
    const ctx = this.ctx;
    // karaoke segue a duração real da fala (buffer TTS), não a cena inteira
    const dur = Math.max(0.001, scene.voiceDur || (scene.end - scene.start));
    const p = Math.min(1, Math.max(0, localT / dur));
    const chunk = scene.chunkTimes.find(c => p >= c.start && p < c.end)
      || scene.chunkTimes[scene.chunkTimes.length - 1];
    if (!chunk || !chunk.text.trim()) return;

    ctx.save();
    ctx.font = '800 52px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = chunk.text.toUpperCase();
    const lines = wrapText(ctx, text, W * 0.86);
    const lh = 62;
    const baseY = H * 0.72;
    lines.forEach((line, i) => {
      const y = baseY + (i - (lines.length - 1) / 2) * lh;
      // fundo arredondado p/ legibilidade
      const tw = ctx.measureText(line).width;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#000';
      roundedRect(ctx, W / 2 - tw / 2 - 18, y - 36, tw + 36, 72, 16);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillText(line, W / 2, y);
    });
    ctx.restore();
  }

  drawWatermark() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '500 24px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.fillText('✨ gerado por IA', W / 2, H - 40);
    ctx.restore();
  }

  drawEndCard(scene, localT) {
    const ctx = this.ctx;
    const dur = scene.end - scene.start;
    const left = dur - localT;
    if (left > 2.2 || this.scenes[this.scenes.length - 1] !== scene) return;
    const p = Math.min(1, (2.2 - left) / 0.6);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = '900 64px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const y = H * 0.45;
    ctx.strokeText('SEGUE PRA MAIS! 🚀', W / 2, y);
    const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    g.addColorStop(0, '#c4b5fd');
    g.addColorStop(1, '#f472b6');
    ctx.fillStyle = g;
    ctx.fillText('SEGUE PRA MAIS! 🚀', W / 2, y);
    ctx.restore();
  }

  draw(t) {
    const ctx = this.ctx;
    const idx = this.sceneAt(t);
    const scene = this.scenes[idx];
    if (!scene) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }

    const localT = t - scene.start;
    const dur = scene.end - scene.start;

    // cena anterior p/ crossfade
    const prev = idx > 0 ? this.scenes[idx - 1] : null;
    const FADE = 0.45;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (prev && localT < FADE) {
      this.drawSceneMedia(prev, prev.end - prev.start, prev.end - prev.start, idx - 1, t);
      ctx.globalAlpha = localT / FADE;
      this.drawSceneMedia(scene, localT, dur, idx, t);
      ctx.globalAlpha = 1;
    } else {
      this.drawSceneMedia(scene, localT, dur, idx, t);
    }

    this.drawOverlays();
    this.drawParticles(t);
    this.drawHeadline(scene, localT);
    this.drawCaptions(scene, localT);
    this.drawEndCard(scene, localT);
    this.drawProgress(t);
    this.drawWatermark();
  }
}
