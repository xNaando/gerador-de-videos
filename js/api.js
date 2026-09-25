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

// ---------- Gerador local de roteiros (quando o LLM está fora) ----------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const HOOKS = [
  (t) => `Para de rolar! Isso sobre ${t} vai mudar seu dia.`,
  (t) => `Ninguém te conta isso sobre ${t}. Presta atenção.`,
  (t) => `Se você se interessa por ${t}, esse vídeo é pra você.`,
  (t) => `Você vai querer salvar isso: ${t} do jeito certo.`,
  (t) => `O erro que 90% das pessoas cometem com ${t}.`,
  (t) => `${t}: a verdade que quase ninguém fala.`,
];

const BODIES = [
  (t) => `A maioria das pessoas complica demais. O segredo de ${t} é constância, não perfeição.`,
  (t) => `Comece pequeno: 5 minutos por dia já muda tudo quando o assunto é ${t}.`,
  (t) => `O que funciona de verdade em ${t} é simplicidade. Esquece as fórmulas mirabolantes.`,
  (t) => `Quem domina ${t} não faz nada mágico — faz o básico todos os dias.`,
  (t) => `A parte que quase todo mundo pula em ${t} é exatamente a que mais importa.`,
  (t) => `Resultado não vem de sorte: em ${t}, vem de fazer o simples com consistência.`,
  (t) => `Um detalhe que faz toda diferença em ${t}: comece hoje, não segunda que vem.`,
];

const CTAS = [
  `Gostou? Segue a página pra mais conteúdo assim e manda pra alguém que precisa ver isso!`,
  `Salva esse vídeo pra não esquecer e segue a gente que vem muito mais!`,
  `Se isso te ajudou, já sabe: curte, comenta e segue pra próxima!`,
  `Quer mais dicas assim? Segue a gente — o próximo vídeo tá ainda melhor!`,
];

const SUBTITLES = {
  hook: ['PRESTA ATENÇÃO', 'OLHA ISSO', 'PARA TUDO', 'ESCUTA ISSO', 'VOCÊ PRECISA VER'],
  body: ['O SEGREDO', 'O QUE FUNCIONA', 'NINGUÉM FALA ISSO', 'SIMPLES ASSIM', 'ANOTA AÍ', 'A CHAVE'],
  cta: ['SEGUE PRA MAIS!', 'SALVA ESSE VÍDEO', 'COMPARTILHA!', 'BORA COMEÇAR'],
};

// mapa pt→en das palavras mais comuns p/ busca de fotos
const EN_MAP = {
  treino: 'workout', treinos: 'workout', academia: 'gym', casa: 'home',
  receita: 'recipe', receitas: 'recipes', comida: 'food', fit: 'fitness',
  saúde: 'health', saude: 'health', dinheiro: 'money', estudo: 'study',
  produtividade: 'productivity', viagem: 'travel', praia: 'beach',
  fotografia: 'photography', yoga: 'yoga', corrida: 'running',
  emagrecimento: 'weight loss', meditação: 'meditation', música: 'music',
  musica: 'music', tecnologia: 'technology', negócios: 'business',
  marketing: 'marketing', vendas: 'sales', moda: 'fashion', beleza: 'beauty',
};

function searchKeywords(topic) {
  const words = topic.toLowerCase()
    .replace(/[^\wà-ú\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  const mapped = words.map(w => EN_MAP[w] || w);
  return [...new Set(mapped)].slice(0, 3).join(' ') || 'lifestyle';
}

function localScript(topic, n) {
  const scenes = [];
  scenes.push({
    narration: pick(HOOKS)(topic),
    subtitle: pick(SUBTITLES.hook),
    image_prompt: `${topic}, eye-catching scene`,
    search: searchKeywords(topic),
  });
  const bodies = [...BODIES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < n - 2; i++) {
    scenes.push({
      narration: bodies[i % bodies.length](topic),
      subtitle: pick(SUBTITLES.body),
      image_prompt: `${topic}, scene ${i + 2}, different angle`,
      search: searchKeywords(topic),
    });
  }
  scenes.push({
    narration: pick(CTAS),
    subtitle: pick(SUBTITLES.cta),
    image_prompt: `${topic}, inspiring finale, bright`,
    search: searchKeywords(topic),
  });
  return {
    title: topic.slice(0, 60),
    caption: `✨ ${topic} — salva esse vídeo pra não esquecer!`,
    hashtags: ['#fyp', '#viral', '#dicas', '#aprendanotiktok', '#reels'],
    scenes,
  };
}

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
    // o Pollinations legacy está instável — falha rápido com timeout
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${TEXT_API}/${encodeURIComponent(prompt)}?model=openai&referrer=videosgratis`,
      { signal: ctrl.signal }
    ).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    console.warn('LLM indisponível, usando gerador local:', e);
    return localScript(topic, nScenes);
  }
}

// ---------- Imagens ----------

export function imageURL(prompt, style, seed, model = 'flux') {
  const full = `${prompt}, ${STYLE_PROMPTS[style] || STYLE_PROMPTS.cinematic}, vertical 9:16 portrait orientation`;
  const params = new URLSearchParams({
    width: '720', height: '1280', seed: String(seed),
    nologo: 'true', model, enhance: 'true',
    referrer: 'videosgratis',
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
