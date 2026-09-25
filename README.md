# 🎬 Gerador de Vídeos IA

Gere vídeos verticais (9:16) prontos para **TikTok** e **Instagram Reels** direto do navegador — sem backend, sem login, sem chave de API.

Digite uma ideia e o app:

1. **✍️ Escreve o roteiro** — LLM gratuito via [Pollinations](https://pollinations.ai) (gancho, cenas, legenda e hashtags)
2. **🎨 Gera as imagens** — um fundo IA por cena, em 720×1280
3. **🗣️ Narra em português** — TTS gratuito com vozes pt-BR (Antônio, Francisca, Thalita)
4. **🎵 Compõe a trilha** — música procedural via Web Audio API (lo-fi, épica ou tensa) com ducking automático sob a narração
5. **🎥 Grava o vídeo** — Canvas + `captureStream` + `MediaRecorder`, com legendas estilo karaoke sincronizadas, efeito Ken Burns, crossfades e barra de progresso

## Como funciona

Tudo roda 100% no navegador:

| Peça | Tecnologia |
|---|---|
| Roteiro | `text.pollinations.ai` (CORS `*`, sem chave) |
| Imagens | `image.pollinations.ai` modelo Flux (CORS `*`, sem chave) |
| Narração | `ahm7xmakki.com/api/tts` — Edge TTS pt-BR (CORS `*`, sem chave) |
| Música | Web Audio API — sintetizada em tempo real |
| Vídeo | Canvas `captureStream(30)` + `MediaRecorder` |

## Deploy no GitHub Pages

```bash
git add .
git commit -m "gerador de vídeos IA"
git push
```

Depois: **Settings → Pages → Source: `main` / `(root)` → Save**

O site fica em `https://<seu-usuario>.github.io/gerador-de-videos/`

## Rodar local

Não pode abrir o `index.html` direto (ES modules exigem HTTP). Use:

```bash
npx serve .
# ou
python -m http.server 8000
```

## Formato do vídeo

- **Chrome/Edge recentes**: grava em **MP4** (H.264) — pronto para TikTok e Instagram
- **Navegadores antigos/Firefox**: grava em **WebM** — o TikTok aceita direto; para o Instagram converta em MP4

## Limitações

- A gravação acontece em **tempo real** (vídeo de 30s leva 30s para renderizar) — mantenha a aba visível
- As APIs gratuitas têm rate limit; se uma imagem falhar, um gradiente animado é usado no lugar
- A narração depende do serviço TTS de terceiros; sem ela o vídeo sai com música + legendas
