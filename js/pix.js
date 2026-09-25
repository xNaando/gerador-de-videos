// Doação via PIX — BR Code (EMV) gerado localmente, sem backend.
// A chave nunca é exibida na tela: só vai para o QR e para a área de transferência.

const PIX_KEY = '10098326627';
const PIX_NAME = 'TREINOS FIT';
const PIX_CITY = 'BRASIL';
const PIX_TXID = 'DOACAO';

function emv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixPayload() {
  const gui = emv('00', 'br.gov.bcb.pix') + emv('01', PIX_KEY);
  let p = emv('00', '01')
    + emv('26', gui)
    + emv('52', '0000')
    + emv('53', '986')
    + emv('58', 'BR')
    + emv('59', PIX_NAME)
    + emv('60', PIX_CITY)
    + emv('62', emv('05', PIX_TXID));
  p += '6304';
  return p + crc16(p);
}

let qrRendered = false;

function showDonation() {
  const box = document.getElementById('donation');
  box.classList.remove('hidden');
  if (qrRendered || typeof qrcode === 'undefined') return;
  qrRendered = true;
  const payload = pixPayload();
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  document.getElementById('pix-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  document.getElementById('pix-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = '✅ Copiado!';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2000);
  });
}
