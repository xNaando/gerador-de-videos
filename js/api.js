// ============================================================
// api.js — integrações gratuitas e sem chave:
//  · text.pollinations.ai  → roteiro do vídeo (LLM)
//  · image.pollinations.ai → imagens de fundo por cena
//  · ahm7xmakki.com/api/tts → narração em pt-BR (MP3)
// Todas respondem com Access-Control-Allow-Origin: *
// ============================================================

const TEXT_API = 'https://text.pollinations.ai';
const IMAGE_API = 'https://image.pollinations.ai/prompt';
const TTS_API = 'https://ahm7xmakki.com/api/tts';

const STYLE_PROMPTS = {
  cinematic: 'cinematic photography, dramatic lighting, film still, high detail, shallow depth of field',
  neon: 'cyberpunk neon aesthetic, glowing lights, dark futuristic city, vibrant purple and pink, digital art',
  nature: 'beautiful nature photography, golden hour, lush landscape, National Geographic style',
  minimal: 'minimalist clean aesthetic, soft pastel gradients, simple elegant composition, lots of negative space',
  anime: 'anime art style, Studio Ghibli inspired, beautiful detailed illustration, vibrant colors',
  retro: 'retro vaporwave aesthetic, 80s synthwave, sunset grid, purple pink gradient, nostalgic',
};

const FALLBACK_SCRIPTS = (topic, n) => {
  const scenes = [
    { narration: `Você sabia disso sobre ${topic}? Fica até o final que vale a pena.`, subtitle: 'VOCÊ SABIA?', image_prompt: topic },
    { narration: `A maioria das pessoas não faz ideia de como ${topic} pode mudar tudo.`, subtitle: 'QUASE NINGUÉM SABE', image_prompt: topic },
    { narration: `O segredo está em começar pequeno e ser consistente todos os dias.`, subtitle: 'O SEGREDO', image_prompt: topic },
    { narration: `E o mais importante: nunca é tarde para começar.`, subtitle: 'NUNCA É TARDE', image_prompt: topic },
    { narration: `Gostou? Segue pra mais conteúdo como esse e compartilha com alguém!`, subtitle: 'SEGUE PRA MAIS!', image_prompt: topic },
  ];
  return {
    title: topic,
    caption: `✨ ${topic} — salva esse vídeo pra não esquecer!`,
    hashtags: ['#fyp', '#viral', '#dicas', '#aprenda', '#tiktok'],
    scenes: scenes.slice(0, n),
  };
};

// Extrai JSON mesmo se o modelo truncar ou malformar a resposta:
// primeiro tenta parse direto; se falhar, vasculha objetos completos
// dentro de "scenes":[...] por balanceamento de chaves.
function extractJSON(text) {
  let t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Resposta sem JSON');
  t = t.slice(start, end + 1);

  try { return JSON.parse(t); } catch {}

  const scenesKey = t.indexOf('"scenes"');
  if (scenesKey === -1) throw new Error('sem scenes');
  const arrStart = t.indexOf('[', scenesKey);
  if (arrStart === -1) throw new Error('sem array de scenes');

  const scenes = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = arrStart; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { scenes.push(JSON.parse(t.slice(objStart, i + 1))); } catch {}
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  if (!scenes.length) throw new Error('sem cenas válidas');

  const pick = (key) => {
    const m = t.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    try { return m ? JSON.parse('"' + m[1] + '"') : ''; } catch { return ''; }
  };
  const hashtags = [];
  const hm = t.match(/"hashtags"\s*:\s*\[([^\]]*)/);
  if (hm) for (const h of hm[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    try { hashtags.push(JSON.parse('"' + h[1] + '"')); } catch {}
  }
  return { title: pick('title'), caption: pick('caption'), hashtags, scenes };
}

async function fetchWithRetry(url, options = {}, tries = 3, delay = 2500) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, delay));
  }
  throw lastErr;
}

// ---------- Roteiro ----------

export async function generateScript(topic, style, nScenes) {
  const prompt = [
    `Você é um roteirista de vídeos virais para TikTok e Instagram Reels em português do Brasil.`,
    `Crie o roteiro de um vídeo vertical sobre: "${topic}".`,
    `Responda APENAS com JSON válido neste formato exato, sem markdown, sem explicações:`,
    `{"title":"título curto","caption":"legenda para o post com emojis","hashtags":["#tag1","#tag2"],"scenes":[{"narration":"frase falada de 1 a 2 linhas","subtitle":"TEXTO CURTO DE ATÉ 5 PALAVRAS EM MAIÚSCULAS","image_prompt":"detailed english prompt for a vertical background image, no text in image","search_keywords":"2 or 3 simple english keywords for a stock photo search, like 'home workout'"}]}`,
    `Regras: exatamente ${nScenes} cenas. A primeira cena deve ser um gancho forte que prende atenção nos primeiros 2 segundos. A última cena deve ser uma chamada para seguir/curtir. Linguagem informal, direta e envolvente.`,
  ].join(' ');

  try {
    const res = await fetchWithRetry(
      `${TEXT_API}/${encodeURIComponent(prompt)}?model=openai`,
      {}, 3, 3000
    );
    const text = await res.text();
    const data = extractJSON(text);
    if (!Array.isArray(data.scenes) || data.scenes.length === 0) throw new Error('sem cenas');
    // sanitiza
    data.scenes = data.scenes.slice(0, nScenes + 1).map(s => ({
      narration: String(s.narration || '').trim(),
      subtitle: String(s.subtitle || '').trim().toUpperCase(),
      image_prompt: String(s.image_prompt || topic).trim(),
      search: String(s.search_keywords || '').trim(),
    }));
    data.hashtags = Array.isArray(data.hashtags) ? data.hashtags : [];
    return data;
  } catch (e) {
    console.warn('LLM falhou, usando roteiro fallback:', e);
    return FALLBACK_SCRIPTS(topic, nScenes);
  }
}

// ---------- Imagens ----------

export function imageURL(prompt, style, seed, model = 'flux') {
  const full = `${prompt}, ${STYLE_PROMPTS[style] || STYLE_PROMPTS.cinematic}, vertical 9:16 portrait orientation`;
  const params = new URLSearchParams({
    width: '720', height: '1280', seed: String(seed),
    nologo: 'true', model, enhance: 'true',
  });
  return `${IMAGE_API}/${encodeURIComponent(full)}?${params}`;
}

export function loadImage(url, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

// imagem com retry e escalonamento — Pollinations dá 429 sob rajadas,
// então os delays crescem e alternamos entre modelos (filas separadas)
const IMG_MODELS = ['flux', 'turbo', 'flux'];
export async function loadImageWithRetry(prompt, style, seed, tries = 3, staggerMs = 0) {
  if (staggerMs) await new Promise(r => setTimeout(r, staggerMs));
  const delays = [6000, 12000, 20000];
  for (let i = 0; i < tries; i++) {
    const img = await loadImage(imageURL(prompt, style, seed + i * 1000, IMG_MODELS[i % IMG_MODELS.length]));
    if (img) return img;
    if (i < tries - 1) await new Promise(r => setTimeout(r, delays[i] || 20000));
  }
  return null;
}

// ---------- Fallback: fotos reais via Openverse (CC, sem chave) ----------
// Busca fotos verticais relacionadas ao tema quando a IA está limitada.
export async function loadOpenverseImage(query) {
  const q = encodeURIComponent(query.split(/\s+/).slice(0, 6).join(' '));
  const url = `https://api.openverse.org/v1/images/?q=${q}&page_size=12&aspect_ratio=tall&license_type=commercial`;
  try {
    const res = await fetchWithRetry(url, {}, 2, 3000);
    const data = await res.json();
    const results = (data.results || [])
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);
    for (const r of results) {
      const img = await loadImage(r.url, 15000);
      if (img) return img;
    }
  } catch (e) {
    console.warn('Openverse falhou:', e);
  }
  return null;
}

// ---------- Narração (TTS) ----------

// Divide texto longo em pedaços (limite da API: ~1950 chars)
function splitText(text, max = 1800) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max) { chunks.push(cur); cur = p; }
    else cur += p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function fetchTTSAudio(text, voiceIndex, audioCtx) {
  const chunks = splitText(text);
  const blobs = await Promise.all(chunks.map(async (chunk) => {
    const res = await fetchWithRetry(TTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceIndex: Number(voiceIndex), text: chunk, rate: 4, pitch: 0 }),
    }, 3, 2000);
    return res.arrayBuffer();
  }));
  const merged = new Blob(blobs, { type: 'audio/mpeg' });
  const buf = await merged.arrayBuffer();
  return audioCtx.decodeAudioData(buf);
}
