// ══════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════
let synth = window.speechSynthesis;
let voices = [];
let _bestVoice = null;   // voz más natural detectada automáticamente

// ── Ranking de voces: prefiere voces neurales/online ──────────
function _rankVoice(v) {
  const n = (v.name || '').toLowerCase();
  const l = (v.lang || '').toLowerCase();
  let score = 0;
  // Idioma español preferido
  if (l.startsWith('es')) score += 100;
  if (l === 'es-es' || l === 'es-mx' || l === 'es-us') score += 10;
  // Voces neurales (Microsoft Edge, Google)
  if (n.includes('neural'))    score += 80;
  if (n.includes('natural'))   score += 60;
  if (n.includes('google'))    score += 50;
  if (n.includes('microsoft')) score += 40;
  // Voces online generalmente son mejores
  if (!v.localService)         score += 30;
  // Voces femeninas tienden a sonar más naturales en español
  if (n.includes('female') || n.includes('mujer') || n.includes('paulina') ||
      n.includes('laura') || n.includes('helena') || n.includes('dalia') ||
      n.includes('sabina') || n.includes('paloma') || n.includes('elvira')) score += 20;
  return score;
}

function loadVoices() {
  const all = synth.getVoices();
  voices = all.filter(v => v.lang.startsWith('es'));
  if (!voices.length) voices = all;

  // Ordenar por calidad y guardar la mejor
  voices.sort((a, b) => _rankVoice(b) - _rankVoice(a));
  _bestVoice = voices[0] || null;

  const sel = document.getElementById('ann-voice');
  if (sel) {
    sel.innerHTML = voices.map((v, i) => {
      const quality = !v.localService ? '⭐ ' : '';
      return `<option value="${i}">${quality}${v.name} (${v.lang})</option>`;
    }).join('');
  }
}
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
setTimeout(loadVoices, 200);   // Chrome necesita un pequeño delay

// ── speak() genérico con parámetros ───────────────────────────
function speak(text, opts = {}) {
  if (!synth || !text) return;

  // Referencia a audio file
  if (text.startsWith('__audio__')) {
    const audioId = text.replace('__audio__', '');
    const af = AUDIO_FILES.find(f => f.id === audioId);
    if (af) { playAudioFile(af.id, af.url, af.name); return; }
  }

  synth.cancel();

  // Mejorar el texto para que suene más natural:
  // Agregar pausas con comas donde el texto las necesita
  let naturalText = text
    .replace(/([.!?])\s+/g, '$1... ')          // pausa después de puntuación
    .replace(/,/g, ', ')                         // asegurar espacio después de coma
    .trim();

  const u = new SpeechSynthesisUtterance(naturalText);
  u.lang = 'es-PE';

  // Seleccionar voz: del selector si está visible, sino la mejor automática
  const sel = document.getElementById('ann-voice');
  if (sel && voices.length && sel.offsetParent !== null) {
    u.voice = voices[parseInt(sel.value) || 0];
  } else if (_bestVoice) {
    u.voice = _bestVoice;
  }

  // Parámetros: los del panel de anuncios si existen, sino los opts, sino defaults naturales
  const rateEl  = document.getElementById('ann-rate');
  const pitchEl = document.getElementById('ann-pitch');
  const volEl   = document.getElementById('ann-vol');

  u.rate   = opts.rate   ?? (rateEl  ? parseFloat(rateEl.value)  : 0.88);
  u.pitch  = opts.pitch  ?? (pitchEl ? parseFloat(pitchEl.value) : 1.05);
  u.volume = opts.volume ?? (volEl   ? parseFloat(volEl.value)   : 1.0);

  synth.speak(u);
}

// ── speakWelcome: voz natural para bienvenida en check-in ─────
function speakWelcome(firstName, planName, daysLeft) {
  let msg;
  const hour = new Date().getHours();

  const greeting = hour < 12 ? 'Buenos días' :
                   hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  if (daysLeft !== undefined && daysLeft <= 3 && daysLeft >= 0) {
    msg = `${greeting}, ${firstName}. Tu membresía vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. Recuerda renovarla.`;
  } else if (daysLeft !== undefined && daysLeft < 0) {
    msg = `Hola, ${firstName}. Tu membresía ha vencido. Por favor acércate a recepción.`;
  } else {
    // Variar el mensaje para que no sea siempre igual
    const msgs = [
      `${greeting}, ${firstName}. Bienvenido al gimnasio.`,
      `${greeting}, ${firstName}. Que tengas un excelente entrenamiento.`,
      `Hola, ${firstName}. ¡Mucho ánimo en tu entrenamiento de hoy!`,
      `${greeting}, ${firstName}. Bienvenido. ¡A dar todo hoy!`,
    ];
    msg = msgs[Math.floor(Math.random() * msgs.length)];
  }

  speak(msg, { rate: 0.9, pitch: 1.05, volume: 1.0 });
}

function speakNow() { const m = document.getElementById('ann-instant')?.value; if (m) speak(m); }
function stopSpeak() { synth?.cancel(); }

let lastAnnounced = {};
function checkScheduledAnn(now) {
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  const tStr = h+':'+m;
  const dStr = ['dom','lun','mar','mié','jue','vie','sáb'][now.getDay()];
  ANNS.forEach(a => {
    if (!a.active || a.time !== tStr || !a.days.includes(dStr)) return;
    const key = a.id + '_' + tStr;
    if (lastAnnounced[key]) return;
    lastAnnounced[key] = true;
    setTimeout(() => speak(a.text), 500);
    setTimeout(() => delete lastAnnounced[key], 65000);
  });
}

async function loadAndRenderAnn() {
  try {
    ANNS = await GET('/announcements');
    renderAnnList();
    // Sync toggles
    const cfg = await GET('/settings');
    ['welcome','renew','open','close'].forEach(k => {
      const el = document.getElementById('tog-'+k);
      if (el) el.checked = cfg['tog'+k.charAt(0).toUpperCase()+k.slice(1)] !== 'false';
    });
    const ot = document.getElementById('open-time');
    const ct = document.getElementById('close-time');
    if (ot) ot.value = cfg.openTime||'06:00';
    if (ct) ct.value = cfg.closeTime||'22:00';
  } catch {}
}

function renderAnnList() {
  const el = document.getElementById('ann-list');
  if (!ANNS.length) { el.innerHTML = '<div class="empty"><div class="eico">🔇</div><div class="etxt">Sin anuncios programados</div></div>'; return; }
  el.innerHTML = ANNS.map(a => `
    <div class="ann-item ${a.active?'on':''}">
      <div class="ann-time">${a.time}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;margin-bottom:4px">${a.text}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${(a.days||[]).map(d=>`<span class="badge bgr">${d}</span>`).join('')}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <label class="tog"><input type="checkbox" ${a.active?'checked':''} onchange="toggleAnn('${a.id}',this.checked)"><span class="tog-sl"></span></label>
        <button class="btn btn-icon btn-ghost" onclick="speak('${a.text.replace(/'/g,"\\'")}')">▶</button>
        <button class="btn btn-icon btn-ghost" onclick="openAnnModal('${a.id}')">✏</button>
        <button class="btn btn-icon btn-danger" onclick="deleteAnn('${a.id}')">✕</button>
      </div>
    </div>`).join('');
}

async function toggleAnn(id, val) {
  await PUT('/announcements/'+id, { active: val });
  ANNS = await GET('/announcements');
  renderAnnList();
}
async function deleteAnn(id) {
  await DEL('/announcements/'+id);
  ANNS = await GET('/announcements');
  renderAnnList();
}

function openAnnModal(id=null) {
  const a = id ? ANNS.find(x=>x.id===id) : null;
  const ALL = ['lun','mar','mié','jue','vie','sáb','dom'];
  openModal(id?'✏ Editar Anuncio':'⏰ Programar Anuncio', `
    <div class="fg" style="margin-bottom:10px"><label>Hora</label><input type="time" id="am-time" value="${a?.time||'08:00'}"></div>
    <div class="fg" style="margin-bottom:10px"><label>Mensaje</label><textarea id="am-text">${a?.text||''}</textarea></div>
    <div class="fg" style="margin-bottom:10px">
      <label>Días</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
        ${ALL.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:13px;text-transform:none;letter-spacing:0;font-weight:500;cursor:pointer">
          <input type="checkbox" id="amd-${d}" ${(a?.days||[]).includes(d)?'checked':''}>${d}</label>`).join('')}
      </div>
    </div>`, [{
      label:'Guardar', cls:'btn-primary', fn: async () => {
        const days = ALL.filter(d=>document.getElementById('amd-'+d)?.checked);
        const data = { text:document.getElementById('am-text').value, time:document.getElementById('am-time').value, days, active:true };
        if (id) await PUT('/announcements/'+id, data); else await POST('/announcements', data);
        closeModal(); ANNS = await GET('/announcements'); renderAnnList(); toast('Anuncio guardado','ok');
      }
    }]);
}

async function saveHours() {
  await PUT('/settings', { openTime: document.getElementById('open-time').value, closeTime: document.getElementById('close-time').value });
  toast('Horario guardado','ok');
}