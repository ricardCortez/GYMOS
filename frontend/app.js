/**
 * GymOS - Aplicación Principal
 * Separado del HTML para mejor organización y mantenimiento
 */

'use strict';

// ══════════════════════════════════════════════════════════════
//  CAMERA SYSTEM (rewritten for Windows compatibility)
// ══════════════════════════════════════════════════════════════

let camStream = null, recognizing = false, lastCheckins = {};
let faceLoopTimer = null;

// ── Utility: get camera stream with fallback constraints ───────
async function getCameraStream(facingMode = 'user', width = 640, height = 480) {
  const constraints = [
    // Ideal
    { video: { width: { ideal: width }, height: { ideal: height }, facingMode } },
    // Fallback: any camera
    { video: true },
  ];
  let lastErr;
  for (const c of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch(e) { lastErr = e; }
  }
  throw lastErr;
}

// ── Utility: attach stream to video element and wait for play ──
function attachStream(videoEl, stream) {
  return new Promise((resolve, reject) => {
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = () => {
      videoEl.play()
        .then(resolve)
        .catch(reject);
    };
    videoEl.onerror = reject;
    // Safety timeout
    setTimeout(resolve, 3000);
  });
}

// ── Utility: capture frame from video as base64 JPEG ──────────
function captureFrame(videoEl, w = 320, h = 240, quality = 0.75) {
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// ── Check browser support ──────────────────────────────────────
function checkCameraSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = '⚠ Navegador sin soporte de cámara. Usa Chrome 60+ o Edge 79+.';
    toast(msg, 'er', 7000);
    return false;
  }
  const isSecure = window.location.protocol === 'https:';
  const isLocal  = ['localhost','127.0.0.1'].includes(window.location.hostname);
  if (!isSecure && !isLocal) {
    toast(
      '⚠ La cámara requiere HTTPS en red local. ' +
      'Reinicia con: python run.py --https',
      'wa', 10000
    );
    return false;
  }
  return true;
}

// ══ ATTENDANCE CAM ════════════════════════════════════════════

function toggleCam() {
  camStream ? stopCam() : startCam();
}

async function startCam() {
  if (!checkCameraSupport()) return;

  const btn        = document.getElementById('cam-btn');
  const vidEl      = document.getElementById('cam-vid');
  const canvasEl   = document.getElementById('cam-cvs');
  const offEl      = document.getElementById('cam-off');
  const decoEl     = document.getElementById('cam-deco');
  const deco2El    = document.getElementById('cam-deco2');
  const scanEl     = document.getElementById('scan-ln');
  const statusEl   = document.getElementById('cam-status');

  if (btn) { btn.textContent = '⏳ Abriendo...'; btn.disabled = true; }

  try {
    camStream = await getCameraStream('user', 640, 480);
    await attachStream(vidEl, camStream);

    vidEl.style.display   = 'block';
    canvasEl.style.display = 'block';
    if (decoEl)  decoEl.style.display  = 'block';
    if (deco2El) deco2El.style.display = 'block';
    if (scanEl)  scanEl.style.display  = 'block';
    if (statusEl) statusEl.style.display = 'block';
    if (offEl)   offEl.style.display   = 'none';

    if (btn) {
      btn.textContent = '⏹ Detener';
      btn.className   = 'btn btn-danger btn-sm';
      btn.disabled    = false;
    }
    setCamInfo('🔍 Enviando frames al servidor cada 800ms...', 'var(--t2)');
    startFaceLoop();

  } catch(e) {
    if (btn) { btn.textContent = '▶ Iniciar Cámara'; btn.disabled = false; }
    camStream = null;
    let msg = 'Error de cámara: ' + e.message;
    if (e.name === 'NotAllowedError')  msg = '⛔ Permiso de cámara denegado. Haz clic en el candado de la barra de direcciones y permite la cámara.';
    if (e.name === 'NotFoundError')    msg = '📷 No se encontró ninguna cámara conectada.';
    if (e.name === 'NotReadableError') msg = '⚠ La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.';
    toast(msg, 'er', 7000);
    setCamInfo(msg, 'var(--red)');
  }
}

function stopCam() {
  recognizing = false;
  clearTimeout(faceLoopTimer);
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }

  const vidEl    = document.getElementById('cam-vid');
  const canvasEl = document.getElementById('cam-cvs');
  const offEl    = document.getElementById('cam-off');
  const decoEl   = document.getElementById('cam-deco');
  const deco2El  = document.getElementById('cam-deco2');
  const scanEl   = document.getElementById('scan-ln');
  const statusEl = document.getElementById('cam-status');
  const recogEl  = document.getElementById('recog-card');

  if (vidEl)    { vidEl.srcObject = null; vidEl.style.display = 'none'; }
  if (canvasEl) canvasEl.style.display  = 'none';
  if (decoEl)   decoEl.style.display   = 'none';
  if (deco2El)  deco2El.style.display  = 'none';
  if (scanEl)   scanEl.style.display   = 'none';
  if (statusEl) statusEl.style.display = 'none';
  if (offEl)    offEl.style.display    = 'flex';
  if (recogEl)  recogEl.style.display  = 'none';

  const btn = document.getElementById('cam-btn');
  if (btn) {
    btn.textContent = '▶ Iniciar Cámara';
    btn.className   = 'btn btn-cyan btn-sm';
  }
}

function setCamInfo(msg, color = 'var(--t2)') {
  const el = document.getElementById('cam-info');
  if (el) { el.textContent = msg; el.style.color = color; }
}

function startFaceLoop() {
  recognizing = true;
  const vidEl = document.getElementById('cam-vid');
  let lastFrameTime = 0;

  const loop = async () => {
    if (!recognizing || !camStream) return;

    const now = Date.now();
    if (now - lastFrameTime < 800) {
      faceLoopTimer = setTimeout(loop, 200);
      return;
    }
    lastFrameTime = now;

    const b64 = captureFrame(vidEl, 320, 240, 0.7);
    if (!b64) {
      faceLoopTimer = setTimeout(loop, 500);
      return;
    }

    try {
      const res = await POST('/face/identify', { image: b64 });
      const statusEl = document.getElementById('cam-status');
      if (res.identified) {
        if (statusEl) { statusEl.textContent = `✅ ${res.member.name}`; statusEl.style.color = 'var(--green)'; }
        showRecogCard(res.member, res.confidence);
        autoCheckin(res.member_id, res.confidence, res.member.name, res.member.days_left, res.member.membership_active);
      } else {
        if (statusEl) { statusEl.textContent = '🔍 ESCANEANDO...'; statusEl.style.color = ''; }
        const rc = document.getElementById('recog-card');
        if (rc) rc.style.display = 'none';
      }
    } catch(e) {
      const statusEl = document.getElementById('cam-status');
      if (statusEl) statusEl.textContent = '⚠ Sin respuesta del servidor';
    }

    if (recognizing) faceLoopTimer = setTimeout(loop, 800);
  };

  // Start after brief delay so video has time to render
  faceLoopTimer = setTimeout(loop, 1200);
}

function showRecogCard(member, confidence) {
  const c = document.getElementById('recog-card');
  if (!c) return;
  const pct = Math.round(confidence * 100);
  c.innerHTML = `
    <div style="font-size:11px;color:var(--green);font-weight:700;letter-spacing:1px;margin-bottom:4px">✅ RECONOCIDO</div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800">${member.name}</div>
    <div style="font-size:11px;color:var(--t2);margin-top:2px">${member.plan} · Confianza: ${pct}%</div>
    ${!member.membership_active ? '<div style="color:var(--red);font-size:11px;margin-top:4px;font-weight:700">⚠ Membresía vencida</div>' : ''}
    ${member.days_left <= 3 && member.membership_active ? `<div style="color:var(--yellow);font-size:11px;margin-top:4px">⏰ Vence en ${member.days_left} día(s)</div>` : ''}
  `;
  c.style.display = 'block';
  setTimeout(() => { if (c) c.style.display = 'none'; }, 4500);
}

async function autoCheckin(memberId, confidence, memberName, daysLeft, membershipActive) {
  const cooldown = (CFG.checkinCooldown || 3600) * 1000;
  const now = Date.now();
  if (lastCheckins[memberId] && (now - lastCheckins[memberId]) < cooldown) return;
  lastCheckins[memberId] = now;
  try {
    const res = await POST('/attendance/checkin', { member_id: memberId, method: 'facial', confidence });
    if (res.ok) {
      const wrap = document.getElementById('cam-wrap');
      if (wrap) {
        const flash = document.createElement('div');
        flash.className = 'checkin-flash';
        wrap.appendChild(flash);
        setTimeout(() => flash.remove(), 700);
      }
      const fullName  = memberName || res.member_name || '';
      const firstName = fullName.split(' ')[0];
      if (document.getElementById('tog-welcome')?.checked) {
        speakWelcome(firstName, null, daysLeft);
      }
      renderTodayLog();
      toast(`✅ Check-in: ${memberName || res.member_name}`, 'ok');
    }
  } catch {}
}

// ══ REGISTRATION FACE CAM ═════════════════════════════════════

let REG_faceStream   = null;
let REG_autoInterval = null;
let REG_capturing    = false;
let REG_photos       = [];   // base64 array

async function startFaceRegCam() {
  if (!checkCameraSupport()) return;

  const btn    = document.getElementById('face-reg-cam-btn');
  const capBtn = document.getElementById('face-cap-btn');
  const autoBtn = document.getElementById('face-auto-btn');
  const offEl  = document.getElementById('face-reg-off');
  const vidEl  = document.getElementById('face-reg-vid');

  if (btn) { btn.textContent = '⏳ Iniciando...'; btn.disabled = true; }

  try {
    REG_faceStream = await getCameraStream('user', 640, 480);
    await attachStream(vidEl, REG_faceStream);

    vidEl.style.display = 'block';
    if (offEl)   offEl.style.display  = 'none';
    if (btn)   { btn.style.display    = 'none'; btn.disabled = false; }
    if (capBtn) { capBtn.style.display = 'flex'; capBtn.disabled = false; }
    if (autoBtn) autoBtn.style.display = 'block';

    updateFaceDots();
    setFaceStatus('📷 Cámara lista. Toma 5 fotos desde distintos ángulos.', 'var(--cyan)');

  } catch(e) {
    if (btn) { btn.textContent = '📷 Iniciar Cámara'; btn.disabled = false; }
    REG_faceStream = null;
    let msg = 'Error cámara: ' + e.message;
    if (e.name === 'NotAllowedError')  msg = '⛔ Permiso de cámara denegado.';
    if (e.name === 'NotFoundError')    msg = '📷 No se encontró ninguna cámara.';
    if (e.name === 'NotReadableError') msg = '⚠ Cámara en uso por otra app.';
    toast(msg, 'er', 6000);
    setFaceStatus(msg, 'var(--red)');
  }
}

function stopFaceRegCam() {
  stopAutoCapture();
  if (REG_faceStream) { REG_faceStream.getTracks().forEach(t => t.stop()); REG_faceStream = null; }
  const vidEl = document.getElementById('face-reg-vid');
  if (vidEl) { vidEl.srcObject = null; vidEl.style.display = 'none'; }
  const offEl = document.getElementById('face-reg-off');
  if (offEl)  offEl.style.display = 'flex';
  const btn = document.getElementById('face-reg-cam-btn');
  if (btn) { btn.style.display = 'flex'; btn.textContent = '📷 Iniciar Cámara'; btn.disabled = false; }
  const capBtn = document.getElementById('face-cap-btn');
  if (capBtn) capBtn.style.display = 'none';
  const autoBtn = document.getElementById('face-auto-btn');
  if (autoBtn) autoBtn.style.display = 'none';
}

async function captureFacePhoto() {
  if (!REG_faceStream || REG_photos.length >= 5 || REG_capturing) return;
  REG_capturing = true;

  const vidEl = document.getElementById('face-reg-vid');
  const b64 = captureFrame(vidEl, 480, 360, 0.88);
  if (!b64) { REG_capturing = false; toast('Error capturando frame', 'wa'); return; }

  // Flash effect on video
  const wrap = document.getElementById('face-reg-wrap');
  if (wrap) {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,.4);z-index:20;pointer-events:none;animation:none';
    wrap.appendChild(flash);
    setTimeout(() => flash.remove(), 150);
  }

  REG_photos.push(b64);
  updateFaceDots();
  updateFaceThumbs();

  const n = REG_photos.length;
  document.getElementById('face-sample-count').textContent = n + ' / 5 fotos';

  const nextBtn = document.getElementById('wiz-face-next');
  if (n >= 3 && nextBtn) nextBtn.disabled = false;

  if (n >= 5) {
    document.getElementById('face-cap-btn').disabled = true;
    stopAutoCapture();
    setFaceStatus('✅ 5 fotos capturadas. Listo para registrar el reconocimiento.', 'var(--green)');
  } else {
    const hints = ['', 'Gira ligeramente a la izquierda', 'Gira a la derecha', 'Inclina la cabeza arriba', 'Baja la barbilla'];
    setFaceStatus(`📸 ${n}/5 · ${hints[n] || 'Cambia el ángulo del rostro'}`, 'var(--cyan)');
  }

  REG_capturing = false;
}

function toggleAutoCapture() {
  if (REG_autoInterval) stopAutoCapture();
  else startAutoCapture();
}

function startAutoCapture() {
  const btn = document.getElementById('face-auto-btn');
  if (btn) { btn.textContent = '⚡ Auto: ON'; btn.style.color = 'var(--green)'; btn.style.borderColor = 'var(--green)'; }
  REG_autoInterval = setInterval(() => {
    if (REG_photos.length >= 5) { stopAutoCapture(); return; }
    captureFacePhoto();
  }, 1400);
}

function stopAutoCapture() {
  if (REG_autoInterval) { clearInterval(REG_autoInterval); REG_autoInterval = null; }
  const btn = document.getElementById('face-auto-btn');
  if (btn) { btn.textContent = '⚡ Auto: OFF'; btn.style.color = ''; btn.style.borderColor = ''; }
}

function updateFaceDots() {
  for (let i = 0; i < 5; i++) {
    const d = document.getElementById('fd' + i);
    if (!d) continue;
    d.className = 'face-dot' + (i < REG_photos.length ? ' captured' : i === REG_photos.length ? ' active' : '');
  }
}

function updateFaceThumbs() {
  const el = document.getElementById('face-thumbs');
  if (!el) return;
  el.innerHTML = REG_photos.map((p, i) => `
    <div style="position:relative">
      <img src="${p}" style="width:56px;height:42px;object-fit:cover;border-radius:4px;border:2px solid var(--green)">
      <div style="position:absolute;top:-4px;right:-4px;background:var(--green);color:#000;width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</div>
    </div>`).join('');
}

function setFaceStatus(msg, color) {
  const el = document.getElementById('face-reg-status');
  if (el) { el.textContent = msg; el.style.color = color || 'var(--t2)'; }
}

async function submitFaceReg() {
  const memberId = REG.memberId;
  if (!memberId || REG_photos.length < 1) { toast('Captura al menos 1 foto', 'wa'); return; }
  const btn = document.getElementById('wiz-face-next');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando...'; }
  try {
    const res = await POST('/face/register', { member_id: memberId, images: REG_photos });
    toast('✅ ' + res.message, 'ok');
    stopFaceRegCam();
    wizNext(2);
    checkFaceStatus();
  } catch(e) {
    toast('Error registro facial: ' + e.message, 'er');
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Rostro →'; }
  }
}

function skipFaceReg() {
  stopFaceRegCam();
  showWizStep(3);
  renderRegSummary();
  toast('Facial omitido. Puedes registrarlo desde el perfil del miembro.', 'wa');
}

// ══ QUICK FACE MODAL CAM (for existing members) ═══════════════
let QF_stream   = null;
let QF_interval = null;
let QF_photos   = [];

async function regFaceForMember(memberId) {
  const m = MEMBERS.find(x => x.id === memberId); if (!m) return;
  QF_photos = [];

  openModal('📸 Registrar Rostro: ' + m.name, buildQFModalHTML(m), [
    { label: 'Registrar Rostros', cls: 'btn-primary', fn: async () => {
      if (!QF_photos.length) { toast('Captura al menos 1 foto', 'wa'); return; }
      try {
        const res = await POST('/face/register', { member_id: memberId, images: QF_photos });
        toast('✅ ' + res.message, 'ok');
        closeModal();
        loadAndRenderMembers();
        checkFaceStatus();
      } catch(e) { toast('Error: ' + e.message, 'er'); }
    }}
  ], true);

  // small delay so DOM is ready
  setTimeout(startQFCam, 300);
}

function buildQFModalHTML(m) {
  return `
    <p style="font-size:12px;color:var(--t2);margin-bottom:12px">Toma 3-5 fotos para registrar el reconocimiento facial de <strong>${m.name}</strong>.</p>
    <div class="face-cap" id="qfc-wrap" style="max-height:300px;position:relative">
      <div id="qfc-off" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--t2);font-size:13px"><div style="font-size:40px;opacity:.3">📷</div>Iniciando cámara...</div>
      <video id="qfc-vid" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;display:none;border-radius:var(--r2)"></video>
      <div class="face-overlay"><div class="face-guide"></div></div>
    </div>
    <div class="face-dots" id="qfc-dots" style="margin:12px 0">
      ${[0,1,2,3,4].map(i=>`<div class="face-dot" id="qfd${i}"></div>`).join('')}
    </div>
    <div id="qfc-status" style="font-size:12px;color:var(--t2);margin-bottom:10px;text-align:center">Preparando cámara...</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-success btn-sm" id="qfc-cap" onclick="captureQFPhoto()" style="flex:1;display:none">📸 Capturar</button>
      <button class="btn btn-ghost btn-sm" id="qfc-auto" onclick="toggleQFAuto()" style="display:none">⚡ Auto: OFF</button>
    </div>`;
}

async function startQFCam() {
  if (!checkCameraSupport()) return;
  const vidEl = document.getElementById('qfc-vid');
  const offEl = document.getElementById('qfc-off');
  const statusEl = document.getElementById('qfc-status');
  if (!vidEl) return;
  try {
    QF_stream = await getCameraStream('user', 480, 360);
    await attachStream(vidEl, QF_stream);
    vidEl.style.display = 'block';
    if (offEl) offEl.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Cámara lista · Captura 3-5 fotos';
    const capBtn  = document.getElementById('qfc-cap');
    const autoBtn = document.getElementById('qfc-auto');
    if (capBtn)  capBtn.style.display  = 'flex';
    if (autoBtn) autoBtn.style.display = 'flex';
  } catch(e) {
    if (statusEl) statusEl.textContent = '⛔ Error: ' + e.message;
    toast('Sin cámara: ' + e.message, 'er');
  }
}

function stopQFCam() {
  clearInterval(QF_interval); QF_interval = null;
  if (QF_stream) { QF_stream.getTracks().forEach(t => t.stop()); QF_stream = null; }
  const vidEl = document.getElementById('qfc-vid');
  if (vidEl) { vidEl.srcObject = null; vidEl.style.display = 'none'; }
}

async function captureQFPhoto() {
  if (!QF_stream || QF_photos.length >= 5) return;
  const vidEl = document.getElementById('qfc-vid');
  const b64 = captureFrame(vidEl, 480, 360, 0.88);
  if (!b64) { toast('Frame no disponible aún, espera un momento', 'wa'); return; }

  // Flash
  const wrap = document.getElementById('qfc-wrap');
  if (wrap) {
    const f = document.createElement('div');
    f.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,.35);z-index:20;pointer-events:none;border-radius:var(--r2)';
    wrap.appendChild(f);
    setTimeout(() => f.remove(), 150);
  }

  QF_photos.push(b64);
  const n = QF_photos.length;

  for (let i = 0; i < 5; i++) {
    const d = document.getElementById('qfd' + i);
    if (d) d.className = 'face-dot' + (i < n ? ' captured' : i === n ? ' active' : '');
  }

  const statusEl = document.getElementById('qfc-status');
  if (statusEl) {
    statusEl.textContent = n >= 5 ? '✅ 5 fotos listas para registrar' : `${n}/5 fotos · Cambia el ángulo`;
    statusEl.style.color = n >= 3 ? 'var(--green)' : 'var(--cyan)';
  }
  if (n >= 5) { clearInterval(QF_interval); QF_interval = null; document.getElementById('qfc-cap').disabled = true; }
}

function toggleQFAuto() {
  const btn = document.getElementById('qfc-auto');
  if (QF_interval) {
    clearInterval(QF_interval); QF_interval = null;
    if (btn) { btn.textContent = '⚡ Auto: OFF'; btn.style.color = ''; }
  } else {
    if (btn) { btn.textContent = '⚡ Auto: ON'; btn.style.color = 'var(--green)'; }
    QF_interval = setInterval(() => {
      if (QF_photos.length >= 5) { clearInterval(QF_interval); QF_interval = null; }
      else captureQFPhoto();
    }, 1400);
  }
}

// override closeModal to also stop QF cam
const _baseCloseModal = closeModal;
closeModal = function() {
  stopQFCam();
  _baseCloseModal();
};

// ══ REGISTRATION PHOTO (for member profile pic) ═══════════════
async function capRegPhoto() {
  if (!checkCameraSupport()) return;
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const stream = await getCameraStream('user', 320, 240);
    const vidEl  = document.createElement('video');
    vidEl.autoplay = true; vidEl.muted = true; vidEl.playsInline = true;
    await attachStream(vidEl, stream);
    await new Promise(r => setTimeout(r, 800)); // let camera adjust
    const b64 = captureFrame(vidEl, 320, 320, 0.85);
    stream.getTracks().forEach(t => t.stop());
    if (!b64) throw new Error('No se pudo capturar');
    document.getElementById('reg-photo-data').value = b64;
    const prev = document.getElementById('reg-av-preview');
    if (prev) prev.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    toast('✓ Foto capturada', 'ok');
  } catch(e) {
    let msg = e.name === 'NotAllowedError' ? 'Permiso de cámara denegado' : 'Error: ' + e.message;
    toast(msg, 'er');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📷 Capturar'; }
  }
}



// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
// API URL dinámica: usa el mismo servidor que sirve el frontend
// Funciona en localhost Y en red local (192.168.X.X) sin cambios
const API = window.location.origin + '/api';
let CFG   = { currency: 'S/', gymName: 'GymOS', faceThreshold: 0.45, checkinCooldown: 3600 };


// ── Registration Wizard State ──────────────────────────────────
let REG = { step: 0, memberId: null, planId: null };

// Cache local
let MEMBERS  = [];
let PLANS    = [];
let MS_LIST  = [];
let PAYS     = [];
let ANNS     = [];

// ══════════════════════════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════════════════════════
async function api(path, opts = {}) {
  try {
    const r = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
    return await r.json();
  } catch (e) {
    throw e;
  }
}
const GET  = p           => api(p);
const POST = (p, b)      => api(p, { method: 'POST',   body: b });
const PUT  = (p, b)      => api(p, { method: 'PUT',    body: b });
const DEL  = p           => api(p, { method: 'DELETE' });

// ══════════════════════════════════════════════════════════════
//  SERVER PING
// ══════════════════════════════════════════════════════════════
async function pingServer() {
  try {
    await fetch(window.location.origin + '/api/settings', { signal: AbortSignal.timeout(2000) });
    setApiStatus(true);
    return true;
  } catch {
    setApiStatus(false);
    return false;
  }
}

function setApiStatus(ok) {
  const pill = document.getElementById('api-pill');
  const dot  = document.getElementById('sys-dot');
  const txt  = document.getElementById('sys-txt');
  if (ok) {
    pill.className = 'tb-pill ok'; pill.textContent = '● Servidor OK';
    dot.className = 'dot dot-green'; txt.textContent = 'Sistema activo';
  } else {
    pill.className = 'tb-pill err'; pill.textContent = '● Sin servidor';
    dot.className = 'dot dot-red'; txt.textContent = 'Servidor desconectado';
  }
}

async function checkFaceStatus() {
  try {
    const s = await POST('/face/status', {});
    const pill = document.getElementById('face-pill');
    if (s.available) {
      pill.className = 'tb-pill ok';
      pill.textContent = `✓ IA Facial (${s.registered_count} miembros)`;
    } else {
      pill.className = 'tb-pill warn';
      pill.textContent = '⚠ IA No disponible';
    }
  } catch {}
}

// ══════════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════════
const DAYS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS= ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function tick() {
  const n = new Date();
  document.getElementById('sb-clock').textContent =
    n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  document.getElementById('sb-date').textContent =
    DAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()];
  if (n.getSeconds() === 0) checkScheduledAnn(n);
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════
const VIEWS = {
  dashboard:     ['Dashboard','Resumen general'],
  attendance:    ['Asistencia','Check-in por reconocimiento facial'],
  register:      ['Nuevo Miembro','Registro con membresía y reconocimiento facial'],
  members:       ['Miembros','Gestión de clientes'],
  memberships:   ['Membresías','Planes y contratos activos'],
  payments:      ['Pagos','Historial de cobros'],
  announcements: ['Anuncios','Mensajes de voz programados'],
  promotions:    ['Promociones','Descuentos y ofertas por tiempo limitado'],
  reports:       ['Reportes','Estadísticas y análisis'],
  settings:      ['Configuración','Ajustes del sistema'],
};

function nav(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  const vEl = document.getElementById('view-' + id);
  if (vEl) vEl.classList.add('active');
  document.querySelectorAll('.sb-item[data-view="' + id + '"]').forEach(i => i.classList.add('active'));
  const [title, sub] = VIEWS[id] || [id, ''];
  document.getElementById('tb-title').textContent = title;
  document.getElementById('tb-sub').textContent = sub;
  // Load data
  if (id === 'dashboard')   renderDashboard();
  if (id === 'attendance')  { renderTodayLog(); if (camStream) {} }
  if (id === 'members')     loadAndRenderMembers();
  if (id === 'memberships') loadAndRenderMs();
  if (id === 'payments')    loadAndRenderPay();
  if (id === 'reports')     setTimeout(renderReports, 120);
  if (id === 'announcements') loadAndRenderAnn();
  if (id === 'promotions')   loadPromotions();
  if (id === 'settings')    loadSettings();
  if (id === 'register')    initRegWizard();
}

document.querySelectorAll('.sb-item[data-view]').forEach(el =>
  el.addEventListener('click', () => nav(el.dataset.view))
);

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
let dashChartInst = null;

async function renderDashboard() {
  try {
    const [stats, todayAtt, attStats, msList] = await Promise.all([
      GET('/dashboard'),
      GET('/attendance/today'),
      GET('/attendance/stats?days=7'),
      GET('/memberships?active_only=true'),
    ]);

    // KPIs
    document.getElementById('dash-kpis').innerHTML = `
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.today_checkins}</div>
        <div class="kpi-lbl">Check-ins Hoy</div>
        <div class="kpi-sub">↑ En tiempo real</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--green)">
        <div class="kpi-val">${stats.active_ms}</div>
        <div class="kpi-lbl">Membresías Activas</div>
        <div class="kpi-sub">${stats.expiring_soon} vencen esta semana</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--yellow)">
        <div class="kpi-val">${stats.total_members}</div>
        <div class="kpi-lbl">Total Miembros</div>
        <div class="kpi-sub">${stats.face_registered} con reconocimiento facial</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--orange)">
        <div class="kpi-val">${CFG.currency}${(stats.month_revenue||0).toLocaleString()}</div>
        <div class="kpi-lbl">Ingresos del Mes</div>
        <div class="kpi-sub">Mes actual</div>
      </div>
    `;

    // Recent checkins
    document.getElementById('sb-today').textContent = stats.today_checkins;
    const ci = document.getElementById('dash-checkins');
    if (!todayAtt.length) {
      ci.innerHTML = '<div class="empty"><div class="eico">🏃</div><div class="etxt">Sin check-ins hoy</div></div>';
    } else {
      ci.innerHTML = '<div style="padding:0 6px">' +
        todayAtt.slice(0,8).map(a => attRow(a)).join('') + '</div>';
    }

    // Renewals
    const renEl = document.getElementById('dash-renewals');
    const expiring = msList.filter(ms => ms.days_left >= 0 && ms.days_left <= 7);
    if (!expiring.length) {
      renEl.innerHTML = '<div class="empty" style="padding:16px"><div class="eico">✅</div><div class="etxt">Sin renovaciones urgentes</div></div>';
    } else {
      renEl.innerHTML = expiring.map(ms => `
        <div class="att-row">
          <div class="att-time" style="color:${ms.days_left<=2?'var(--red)':'var(--yellow)'};font-size:18px">${ms.days_left}d</div>
          <div style="flex:1"><div style="font-weight:600;font-size:13px">${ms.member_name}</div><div style="font-size:11px;color:var(--t2)">${ms.plan_name} • vence ${ms.end_date}</div></div>
          <button class="btn btn-ghost btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button>
        </div>`).join('');
    }

    // Chart
    const labels = [], data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      labels.push(DAYS[d.getDay()]);
      data.push(attStats[ds] || 0);
    }
    const ctx = document.getElementById('dash-chart');
    if (dashChartInst) dashChartInst.destroy();
    dashChartInst = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: 'rgba(255,107,0,.6)', borderColor: 'var(--orange)', borderWidth: 2, borderRadius: 5 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#8890c0'}},
                 y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#8890c0',stepSize:1}}}}
    });

  } catch(e) { toast('Error cargando dashboard: ' + e.message, 'er'); }
}

function attRow(a) {
  const t  = new Date(a.check_in);
  const ts = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');

  const methodBadge =
    a.method === 'facial'      ? '<span class="badge bb">👁 Facial</span>'      :
    a.method === 'fingerprint' ? '<span class="badge bp">🖐 Huella</span>'      :
    a.method === 'qr'          ? '<span class="badge bc">◼ QR</span>'           :
                                 '<span class="badge bgr">✍ Manual</span>';

  const deletedStyle = a.deleted ? 'opacity:.5;' : '';
  const deletedBadge = a.deleted ? '<span class="badge" style="background:rgba(239,71,111,.1);color:var(--red);border:1px solid rgba(239,71,111,.3);font-size:10px">eliminado</span>' : '';

  const avatarContent = a.member_avatar
    ? `<img src="${a.member_avatar}">`
    : `<span style="font-size:13px;color:${a.deleted ? 'var(--red)' : ''}">${a.deleted ? '✕' : (a.member_name||'?')[0]}</span>`;

  return `<div class="att-row" style="${deletedStyle}">
    <div class="att-time">${ts}</div>
    <div class="att-av" style="${a.deleted ? 'border-color:rgba(239,71,111,.3);background:rgba(239,71,111,.08)' : ''}">${avatarContent}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">
        ${a.member_name} ${deletedBadge}
      </div>
      <div style="font-size:11px;color:var(--t2)">${a.plan||'—'}</div>
    </div>
    ${methodBadge}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  ATTENDANCE + FACIAL RECOGNITION
// ══════════════════════════════════════════════════════════════

async function renderTodayLog() {
  try {
    const data = await GET('/attendance/today');
    document.getElementById('att-count').textContent = data.length + ' registros';
    document.getElementById('sb-today').textContent = data.length;
    const el = document.getElementById('att-log');
    if (!data.length) {
      el.innerHTML = '<div class="empty"><div class="eico">📋</div><div class="etxt">Sin registros hoy</div></div>';
    } else {
      el.innerHTML = '<div style="padding:0 4px">' + data.map(a => attRow(a)).join('') + '</div>';
    }
  } catch {}
}

async function fpAuth() {
  if (!window.PublicKeyCredential) { toast('WebAuthn no soportado en este dispositivo', 'wa'); return; }
  try {
    const creds = MEMBERS.filter(m => m.has_fingerprint).map(m => ({
      type: 'public-key', id: base64ToUint8(m.credential_id)
    }));
    if (!creds.length) { toast('Ningún miembro tiene huella registrada', 'wa'); return; }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: { challenge, allowCredentials: creds, userVerification: 'required', timeout: 60000 }
    });
    const credId = uint8ToBase64(new Uint8Array(assertion.rawId));
    const member = MEMBERS.find(m => m.credential_id === credId);
    if (member) {
      await POST('/attendance/checkin', { member_id: member.id, method: 'fingerprint' });
      renderTodayLog();
      toast('🖐 Check-in por huella: ' + member.name, 'ok');
    } else { toast('Huella no reconocida', 'er'); }
  } catch(e) {
    if (e.name !== 'NotAllowedError') toast('Error huella: ' + e.message, 'er');
  }
}

function base64ToUint8(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
function uint8ToBase64(u8)  { return btoa(String.fromCharCode(...u8)); }

function openManual() {
  openModal('✍ Check-in Manual', `
    <div class="fg"><label>Miembro</label>
      <select id="man-mem">${MEMBERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>
    </div>`, [{
      label: 'Registrar', cls: 'btn-primary', fn: async () => {
        const mid = document.getElementById('man-mem').value;
        await POST('/attendance/checkin', { member_id: mid, method: 'manual' });
        closeModal(); renderTodayLog();
        toast('✅ Check-in manual registrado', 'ok');
      }
    }]);
}

// ══════════════════════════════════════════════════════════════
//  REGISTRATION WIZARD
// ══════════════════════════════════════════════════════════════

function initRegWizard() {
  // Reset state
  REG = { step: 0, memberId: null, planId: null };
  REG_photos    = [];
  REG_capturing = false;

  // ── Limpiar campos del paso 1 (datos personales) ──────────
  const clearIds = [
    'reg-name','reg-doc','reg-email','reg-phone',
    'reg-birth','reg-address','reg-emergency','reg-notes',
    'reg-photo-data',
  ];
  clearIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Limpiar avatar preview
  const av = document.getElementById('reg-av-preview');
  if (av) av.innerHTML = '<span style="font-size:28px;opacity:.4">📷</span>';

  // ── Limpiar campos del paso 2 (membresía) ─────────────────
  const amountEl = document.getElementById('reg-amount');
  const refEl    = document.getElementById('reg-ref');
  const notesEl  = document.getElementById('reg-ms-notes');
  if (amountEl) amountEl.value = '';
  if (refEl)    refEl.value    = '';
  if (notesEl)  notesEl.value  = '';

  // Deseleccionar plan activo
  document.querySelectorAll('.plan-card.selected').forEach(c => c.classList.remove('selected'));
  REG.planId = null;

  // ── Limpiar paso 3 (fotos faciales) ───────────────────────
  updateFaceDots();
  updateFaceThumbs();
  const sampleCount = document.getElementById('face-sample-count');
  if (sampleCount) sampleCount.textContent = '0 / 5 fotos';
  setFaceStatus('📷 Inicia la cámara y toma 5 fotos', '');

  // Detener cámara si quedó abierta de una sesión anterior
  if (REG_faceStream) stopFaceRegCam();
  const capBtn = document.getElementById('face-cap-btn');
  if (capBtn) { capBtn.disabled = false; capBtn.style.display = 'none'; }
  const regCamBtn = document.getElementById('face-reg-cam-btn');
  if (regCamBtn) regCamBtn.style.display = 'flex';

  // ── Fecha de inicio por defecto = hoy ─────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const sd = document.getElementById('reg-start');
  if (sd) sd.value = today;

  // Método de pago por defecto
  const pm = document.getElementById('reg-payment-method');
  if (pm) pm.value = 'Efectivo';

  showWizStep(0);
  loadPlansForReg();
}

function showWizStep(step) {
  REG.step = step;
  [0,1,2,3].forEach(i => {
    const el = document.getElementById('wstep-' + i);
    if (el) el.style.display = i === step ? (i===0?'block':'block') : 'none';
    const num = document.getElementById('ws'+i)?.querySelector('.wiz-num');
    if (num) {
      num.className = 'wiz-num' + (i < step ? ' done' : i === step ? ' active' : '');
      num.textContent = i < step ? '✓' : i+1;
    }
    const lbl = document.getElementById('ws'+i)?.querySelector('.wiz-lbl');
    if (lbl) lbl.parentElement.className = 'wiz-step' + (i === step ? ' active' : '');
  });
}

async function wizNext(from) {
  if (from === 0) {
    if (!document.getElementById('reg-name').value.trim()) { toast('El nombre es requerido','wa'); return; }
    // Save draft member
    try {
      const photo = document.getElementById('reg-photo-data').value;
      const payload = {
        name: document.getElementById('reg-name').value.trim(),
        document_id: document.getElementById('reg-doc').value,
        birth_date: document.getElementById('reg-birth').value,
        email: document.getElementById('reg-email').value,
        phone: document.getElementById('reg-phone').value,
        address: document.getElementById('reg-addr').value,
        emergency_contact: document.getElementById('reg-emerg').value,
        notes: document.getElementById('reg-notes').value,
        avatar: photo || '',
      };
      const m = await POST('/members', payload);
      REG.memberId = m.id;
      MEMBERS.push(m);
      toast('Datos guardados ✓','in');
      showWizStep(1);
    } catch(e) { toast('Error: ' + e.message,'er'); }
  } else if (from === 1) {
    if (!REG.planId) { toast('Selecciona un plan','wa'); return; }
    const plan = PLANS.find(p => p.id === REG.planId);
    const amount = document.getElementById('reg-amount').value || plan?.price || 0;
    try {
      await POST('/memberships', {
        member_id: REG.memberId,
        plan_id: REG.planId,
        start_date: document.getElementById('reg-start').value,
        amount: parseFloat(amount),
        payment_method: document.getElementById('reg-paymethod').value,
      });
      toast('Membresía creada ✓','in');
      showWizStep(2);
      setTimeout(startFaceRegCam, 400);
    } catch(e) { toast('Error membresía: ' + e.message,'er'); }
  } else if (from === 2) {
    showWizStep(3);
    renderRegSummary();
    stopFaceRegCam();
  }
}

function wizBack(from) {
  if (from === 2) stopFaceRegCam();
  showWizStep(from - 1);
}

async function finalizeRegistration() {
  const btn = document.getElementById('reg-final-btn');
  btn.disabled = true; btn.textContent = '⏳ Registrando...';
  // Clear form for next registration
  toast('✅ ¡Miembro registrado exitosamente!','ok');
  setTimeout(() => {
    btn.disabled = false; btn.textContent = '✅ Confirmar y Registrar';
    nav('members');
  }, 1500);
}

function renderRegSummary() {
  const m = MEMBERS.find(x => x.id === REG.memberId);
  const p = PLANS.find(x => x.id === REG.planId);
  if (!m || !p) return;
  document.getElementById('reg-summary').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;border:2px solid var(--b2)">
        ${m.avatar?`<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover">`:(m.name[0]||'?')}
      </div>
      <div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800">${m.name}</div>
        <div style="font-size:12px;color:var(--t2)">${m.document_id||''} ${m.email?'• '+m.email:''}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <span class="badge bg">✅ Datos registrados</span>
          <span class="badge bb">${p.icon} ${p.name}</span>
          ${REG_photos.length>0?'<span class="badge bp">📸 '+REG_photos.length+' fotos faciales</span>':'<span class="badge bgr">Sin reconocimiento facial</span>'}
        </div>
      </div>
    </div>
    <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
        <div><span style="color:var(--t2)">Plan:</span> <strong>${p.name}</strong></div>
        <div><span style="color:var(--t2)">Duración:</span> <strong>${p.duration} días</strong></div>
        <div><span style="color:var(--t2)">Inicio:</span> <strong>${document.getElementById('reg-start').value}</strong></div>
        <div><span style="color:var(--t2)">Pago:</span> <strong>${CFG.currency}${document.getElementById('reg-amount').value || p.price}</strong></div>
        <div><span style="color:var(--t2)">Método:</span> <strong>${document.getElementById('reg-paymethod').value}</strong></div>
        <div><span style="color:var(--t2)">Biométrico:</span> <strong>${REG_photos.length>0?REG_photos.length+' fotos':'—'}</strong></div>
      </div>
    </div>
  `;
}

// Plan selection in wizard
function loadPlansForReg() {
  GET('/plans').then(plans => {
    PLANS = plans;
    const el = document.getElementById('reg-plan-cards');
    if (!el) return;
    el.innerHTML = plans.map(p => `
      <div class="pc ${p.featured?'feat':''} ${REG.planId===p.id?'selected':''}" id="rpc-${p.id}" onclick="selectRegPlan('${p.id}')">
        ${p.featured?'<div class="pc-badge">POPULAR</div>':''}
        <div class="pc-icon">${p.icon}</div>
        <div class="pc-name">${p.name}</div>
        <div class="pc-price">${CFG.currency}${p.price}</div>
        <div class="pc-dur">${p.duration===30?'por mes':p.duration===365?'por año':p.duration+' días'}</div>
        <div class="pc-feats">${(p.features||[]).map(f=>`<div class="pc-feat">${f}</div>`).join('')}</div>
      </div>`).join('');
    // Set amount field based on plan
  }).catch(() => {});
}

function selectRegPlan(id) {
  REG.planId = id;
  document.querySelectorAll('[id^="rpc-"]').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('rpc-' + id);
  if (el) { el.style.borderColor = 'var(--orange)'; el.style.background = 'var(--s2)'; }
  const plan = PLANS.find(p => p.id === id);
  if (plan) {
    const amt = document.getElementById('reg-amount');
    if (amt) amt.value = plan.price;
  }
  // Load available promotions for this plan
  onWizPlanSelected(id);
}

function loadRegPhoto(input) {
  const file = input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = e => {
    document.getElementById('reg-photo-data').value = e.target.result;
    const prev = document.getElementById('reg-av-preview');
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  r.readAsDataURL(file);
}

// ── FACE REGISTRATION ───────────────────────────────────────

// ══════════════════════════════════════════════════════════════
//  MEMBERS
// ══════════════════════════════════════════════════════════════
async function loadAndRenderMembers() {
  try {
    MEMBERS = await GET('/members');
    // Update plan filter
    const sel = document.getElementById('mem-filter');
    if (sel && PLANS.length) {
      const current = sel.innerHTML;
      if (current.trim() === '<option value="">Todos los planes</option>') {
        PLANS.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
      }
    }
    renderMembers();
  } catch(e) { toast('Error cargando miembros: '+e.message,'er'); }
}

function renderMembers() {
  const q  = (document.getElementById('mem-q')?.value||'').toLowerCase();
  const pf = document.getElementById('mem-filter')?.value||'';
  const filtered = MEMBERS.filter(m => {
    const inQ = !q || m.name.toLowerCase().includes(q) || (m.document_id||'').includes(q) || (m.email||'').toLowerCase().includes(q);
    return inQ;
  });
  const colors = ['var(--orange)','var(--cyan)','var(--green)','var(--purple)','var(--yellow)'];
  const grid = document.getElementById('member-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">👥</div><div class="etxt">Sin miembros</div></div>';
    return;
  }
  grid.innerHTML = filtered.map((m,i) => {
    const plan = PLANS.find(p=>p.id===m.plan_id)||{name:'Sin plan'};
    const c = colors[i%colors.length];
    return `<div class="mc" onclick="openMemberDetail('${m.id}')">
      <div class="mc-strip" style="background:${c}"></div>
      <div class="mc-acts">
        <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();editMember('${m.id}')">✏</button>
        <button class="btn btn-icon btn-danger" onclick="event.stopPropagation();deleteMember('${m.id}')">✕</button>
      </div>
      <div class="mc-av" style="border:2px solid ${m.face_registered?'var(--cyan)':'var(--b2)'}">
        ${m.avatar?`<img src="${m.avatar}">`:`<span style="color:${c}">${(m.name||'?')[0]}</span>`}
      </div>
      <div class="mc-name">${m.name}</div>
      <div class="mc-plan">${m.document_id||''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
        ${m.face_registered?'<span class="badge bb">👁 Facial</span>':''}
        ${m.has_fingerprint?'<span class="badge bp">🖐 Huella</span>':''}
      </div>
    </div>`;
  }).join('');
}

async function openMemberDetail(id) {
  const m = MEMBERS.find(x=>x.id===id); if(!m) return;
  try {
    const msList = await GET('/memberships');
    const ms = msList.filter(x=>x.member_id===id).sort((a,b)=>new Date(b.end_date)-new Date(a.end_date))[0];
    const attRes = await GET('/attendance/stats?days=30');
    const totalAtt = Object.values(attRes).reduce((s,v)=>s+v,0);
    openModal('👤 Perfil: '+m.name, `
      <div style="text-align:center;margin-bottom:18px">
        <div style="width:80px;height:80px;border-radius:50%;background:var(--s3);margin:0 auto 10px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:34px;border:2px solid var(--b2)">
          ${m.avatar?`<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover">`:(m.name[0]||'?')}
        </div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800">${m.name}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:4px">${m.document_id||''} • ${m.email||''} • ${m.phone||''}</div>
        <div style="display:flex;justify-content:center;gap:6px;margin-top:8px">
          ${ms?`<span class="badge ${ms.active?'bg':'br'}">${ms.active?'Activo':'Vencido'}</span>`:''}
          ${m.face_registered?'<span class="badge bb">👁 Facial ('+m.face_samples+' fotos)</span>':'<span class="badge bgr">Sin reconocimiento</span>'}
          ${m.has_fingerprint?'<span class="badge bp">🖐 Huella</span>':''}
        </div>
      </div>
      ${ms?`<div style="background:var(--s2);border-radius:var(--r);padding:12px;margin-bottom:14px;border:1px solid var(--b1);font-size:13px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--t2)">Plan</span><strong>${ms.plan_name}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--t2)">Vencimiento</span><strong style="color:${ms.days_left<=7?'var(--red)':'var(--green)'}">${ms.end_date} (${ms.days_left}d)</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--t2)">Monto pagado</span><strong>${CFG.currency}${ms.amount}</strong></div>
      </div>`:''}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-cyan" onclick="closeModal();regFaceForMember('${m.id}')">📸 ${m.face_registered?'Actualizar':'Registrar'} Reconocimiento Facial</button>
        <button class="btn btn-ghost" onclick="closeModal();editMember('${m.id}')">✏ Editar Datos</button>
        ${ms?`<button class="btn btn-ghost" onclick="closeModal();openRenewModal('${ms.id}')">🔄 Renovar Membresía</button>`:'<button class="btn btn-primary" onclick="closeModal();openAssignMs()">➕ Asignar Membresía</button>'}
      </div>`, [{label:'Cerrar', cls:'btn-ghost', fn:closeModal}]);
  } catch(e) { toast('Error: '+e.message,'er'); }
}

async function editMember(id) {
  const m = MEMBERS.find(x=>x.id===id); if(!m) return;
  openModal('✏ Editar Miembro', `
    <div class="fgrid">
      <div class="fg full"><label>Nombre</label><input id="em-name" value="${m.name||''}"></div>
      <div class="fg"><label>DNI</label><input id="em-doc" value="${m.document_id||''}"></div>
      <div class="fg"><label>Teléfono</label><input id="em-phone" value="${m.phone||''}"></div>
      <div class="fg full"><label>Email</label><input id="em-email" value="${m.email||''}"></div>
      <div class="fg full"><label>Notas</label><textarea id="em-notes">${m.notes||''}</textarea></div>
    </div>`, [{
      label:'Guardar', cls:'btn-primary', fn: async () => {
        await PUT('/members/'+id, { name:document.getElementById('em-name').value, document_id:document.getElementById('em-doc').value, phone:document.getElementById('em-phone').value, email:document.getElementById('em-email').value, notes:document.getElementById('em-notes').value });
        closeModal(); loadAndRenderMembers(); toast('Miembro actualizado','ok');
      }
    }]);
}

async function deleteMember(id) {
  if (!confirm('¿Eliminar este miembro?')) return;
  await DEL('/members/'+id);
  loadAndRenderMembers(); toast('Miembro eliminado','in');
}

// ══════════════════════════════════════════════════════════════
//  MEMBERSHIPS
// ══════════════════════════════════════════════════════════════
async function loadAndRenderMs() {
  try {
    const [ms, plans] = await Promise.all([GET('/memberships'), GET('/plans')]);
    MS_LIST = ms; PLANS = plans;
    renderPlanGrid();
    renderMemberships();
  } catch(e) { toast('Error: '+e.message,'er'); }
}

function msTab(tab, el) {
  ['plans','active','expired'].forEach(t => document.getElementById('ms-'+t).style.display = t===tab?'block':'none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (tab === 'active') renderMemberships();
  if (tab === 'expired') renderMemberships(true);
}

function renderPlanGrid() {
  document.getElementById('plan-grid').innerHTML = PLANS.map(p => `
    <div class="pc ${p.featured?'feat':''}">
      ${p.featured?'<div class="pc-badge">POPULAR</div>':''}
      <div class="pc-acts">
        <button class="btn btn-icon btn-ghost" onclick="openPlanModal('${p.id}')">✏</button>
        <button class="btn btn-icon btn-danger" onclick="deletePlan('${p.id}')">✕</button>
      </div>
      <div class="pc-icon">${p.icon}</div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-price">${CFG.currency}${p.price}</div>
      <div class="pc-dur">${p.duration===30?'por mes':p.duration===365?'por año':p.duration+' días'}</div>
      <div class="pc-feats">${(p.features||[]).map(f=>`<div class="pc-feat">${f}</div>`).join('')}</div>
    </div>`).join('');
}

function renderMemberships(showExpired=false) {
  const q   = (document.getElementById('ms-q')?.value||'').toLowerCase();
  const now = new Date();
  const all = MS_LIST.filter(ms => showExpired ? ms.days_left < 0 : ms.days_left >= 0);
  const filtered = all.filter(ms => !q || ms.member_name.toLowerCase().includes(q));

  const tbody = document.getElementById(showExpired ? 'ms-exp-tbody' : 'ms-tbody');
  if (!tbody) return;
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--t2)">Sin registros</td></tr>`; return; }

  tbody.innerHTML = filtered.map(ms => {
    const pct = Math.min(100, Math.max(0, (1 - ms.days_left/(PLANS.find(p=>p.id===ms.plan_id)?.duration||30))*100));
    if (showExpired) return `
      <tr>
        <td><div class="td-name">${ms.member_name}</div></td>
        <td>${ms.plan_name}</td>
        <td style="color:var(--red)">${ms.end_date}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button></td>
      </tr>`;
    return `
      <tr>
        <td><div class="td-name">${ms.member_name}</div></td>
        <td><span class="badge bgr">${ms.plan_name}</span></td>
        <td>${ms.start_date}</td>
        <td>
          <div>${ms.end_date}</div>
          <div class="prog" style="width:100px;margin-top:4px"><div class="prog-fill" style="width:${pct}%;background:${ms.days_left<=7?'var(--red)':ms.days_left<=14?'var(--yellow)':'var(--green)'}"></div></div>
        </td>
        <td><span class="badge ${ms.days_left<=7?'br':ms.days_left<=14?'by':'bg'}">${ms.days_left}d</span></td>
        <td><button class="btn btn-ghost btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button></td>
      </tr>`;
  }).join('');
}

function openPlanModal(id=null) {
  const p = id ? PLANS.find(x=>x.id===id) : null;
  openModal(id?'✏ Editar Plan':'✚ Nuevo Plan', `
    <div class="fgrid">
      <div class="fg"><label>Nombre</label><input id="pm-name" value="${p?.name||''}"></div>
      <div class="fg"><label>Ícono</label><input id="pm-icon" value="${p?.icon||'💪'}" style="font-size:18px"></div>
      <div class="fg"><label>Precio (${CFG.currency})</label><input id="pm-price" type="number" value="${p?.price||0}"></div>
      <div class="fg"><label>Duración (días)</label><input id="pm-dur" type="number" value="${p?.duration||30}"></div>
      <div class="fg full"><label>Beneficios (uno por línea)</label><textarea id="pm-feats">${(p?.features||[]).join('\n')}</textarea></div>
      <div class="fg"><label>¿Plan destacado?</label><select id="pm-feat"><option value="0">No</option><option value="1" ${p?.featured?'selected':''}>Sí</option></select></div>
    </div>`, [{
      label:'Guardar Plan', cls:'btn-primary', fn: async () => {
        const data = { name:document.getElementById('pm-name').value, icon:document.getElementById('pm-icon').value, price:parseFloat(document.getElementById('pm-price').value)||0, duration:parseInt(document.getElementById('pm-dur').value)||30, features:document.getElementById('pm-feats').value.split('\n').filter(Boolean), featured:document.getElementById('pm-feat').value==='1' };
        if (id) await PUT('/plans/'+id, data); else await POST('/plans', data);
        closeModal(); loadAndRenderMs(); toast('Plan guardado','ok');
      }
    }]);
}

async function deletePlan(id) {
  if (!confirm('¿Eliminar este plan?')) return;
  await DEL('/plans/'+id); loadAndRenderMs(); toast('Plan eliminado','in');
}

function openRenewModal(msId) {
  const ms = MS_LIST.find(x=>x.id===msId);
  openModal('🔄 Renovar Membresía', `
    <div style="background:var(--s2);padding:12px;border-radius:var(--r);margin-bottom:14px;font-size:13px">
      <strong>${ms?.member_name}</strong> — Plan: ${ms?.plan_name}
    </div>
    <div class="fgrid">
      <div class="fg"><label>Nuevo Plan</label><select id="rn-plan">${PLANS.map(p=>`<option value="${p.id}" ${p.id===ms?.plan_id?'selected':''}>${p.name} — ${CFG.currency}${p.price}</option>`).join('')}</select></div>
      <div class="fg"><label>Inicio</label><input type="date" id="rn-start" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label>Método de Pago</label><select id="rn-method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option><option>Plin</option></select></div>
      <div class="fg"><label>Monto</label><input type="number" id="rn-amount" value="${ms?.amount||0}"></div>
    </div>`, [{
      label:'Renovar y Cobrar', cls:'btn-success', fn: async () => {
        await PUT('/memberships/'+msId+'/renew', { plan_id:document.getElementById('rn-plan').value, start_date:document.getElementById('rn-start').value, payment_method:document.getElementById('rn-method').value, amount:parseFloat(document.getElementById('rn-amount').value)||0 });
        closeModal(); loadAndRenderMs(); toast('✅ Membresía renovada','ok');
      }
    }]);
}

function openAssignMs() {
  openModal('✚ Asignar Membresía', `
    <div class="fgrid">
      <div class="fg"><label>Miembro</label><select id="as-mem">${MEMBERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Plan</label><select id="as-plan">${PLANS.map(p=>`<option value="${p.id}">${p.name} — ${CFG.currency}${p.price}</option>`).join('')}</select></div>
      <div class="fg"><label>Inicio</label><input type="date" id="as-start" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label>Método Pago</label><select id="as-method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option></select></div>
    </div>`, [{
      label:'Asignar', cls:'btn-primary', fn: async () => {
        await POST('/memberships', { member_id:document.getElementById('as-mem').value, plan_id:document.getElementById('as-plan').value, start_date:document.getElementById('as-start').value, payment_method:document.getElementById('as-method').value });
        closeModal(); loadAndRenderMs(); toast('Membresía asignada','ok');
      }
    }]);
}

// ══════════════════════════════════════════════════════════════
//  PAYMENTS
// ══════════════════════════════════════════════════════════════
async function loadAndRenderPay() {
  try {
    PAYS = await GET('/payments');
    renderPayments();
  } catch(e) { toast('Error: '+e.message,'er'); }
}

function renderPayments() {
  const q = (document.getElementById('pay-q')?.value||'').toLowerCase();
  const filtered = PAYS.filter(p => !q || p.member_name.toLowerCase().includes(q) || (p.concept||'').toLowerCase().includes(q));
  const total = PAYS.reduce((s,p)=>s+p.amount,0);
  const monthStart = new Date(); monthStart.setDate(1);
  const monthTotal = PAYS.filter(p=>new Date(p.date)>=monthStart).reduce((s,p)=>s+p.amount,0);
  document.getElementById('pay-kpis').innerHTML = `
    <div class="kpi" style="--kpi-c:var(--green)"><div class="kpi-val">${CFG.currency}${total.toLocaleString()}</div><div class="kpi-lbl">Total Acumulado</div></div>
    <div class="kpi" style="--kpi-c:var(--orange)"><div class="kpi-val">${CFG.currency}${monthTotal.toLocaleString()}</div><div class="kpi-lbl">Este Mes</div></div>
    <div class="kpi" style="--kpi-c:var(--cyan)"><div class="kpi-val">${PAYS.length}</div><div class="kpi-lbl">Transacciones</div></div>
  `;
  const tbody = document.getElementById('pay-tbody');
  tbody.innerHTML = filtered.length ? filtered.map(p => `
    <tr>
      <td>${p.date}</td>
      <td><div class="td-name">${p.member_name}</div></td>
      <td>${p.concept||'—'}</td>
      <td style="font-weight:700;color:var(--green)">${CFG.currency}${p.amount}</td>
      <td>${p.method||'—'}</td>
      <td><span class="badge bg">${p.status}</span></td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--t2)">Sin pagos</td></tr>';
}

function openPayModal() {
  openModal('💰 Registrar Pago', `
    <div class="fgrid">
      <div class="fg"><label>Miembro</label><select id="pay-mem">${MEMBERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Concepto</label><input id="pay-concept" value="Membresía"></div>
      <div class="fg"><label>Monto</label><input type="number" id="pay-amt" value="0"></div>
      <div class="fg"><label>Método</label><select id="pay-met"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option></select></div>
      <div class="fg"><label>Fecha</label><input type="date" id="pay-date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>`, [{
      label:'Registrar', cls:'btn-primary', fn: async () => {
        await POST('/payments', { member_id:document.getElementById('pay-mem').value, concept:document.getElementById('pay-concept').value, amount:parseFloat(document.getElementById('pay-amt').value)||0, method:document.getElementById('pay-met').value, date:document.getElementById('pay-date').value, status:'pagado' });
        closeModal(); loadAndRenderPay(); toast('Pago registrado','ok');
      }
    }]);
}

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

// ══════════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════════
let charts = {};
async function renderReports() {
  try {
    const days = parseInt(document.getElementById('rep-days')?.value || '30');

    const [stats, attStats, byHour, topMembers, ms, pays] = await Promise.all([
      GET('/dashboard'),
      GET('/attendance/stats?days=' + days),
      GET('/attendance/by-hour?days=' + days),
      GET('/attendance/top-members?days=' + days + '&limit=8'),
      GET('/memberships'),
      GET('/payments'),
    ]);

    // ── KPIs ──────────────────────────────────────────────────
    const avgPerDay = days > 0
      ? (Object.values(attStats).reduce((s,v)=>s+v,0) / days).toFixed(1)
      : 0;
    const expiringSoon = ms.filter(m => m.active && m.days_left <= 7).length;

    document.getElementById('rep-kpis').innerHTML = `
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.total_members}</div>
        <div class="kpi-lbl">Total Miembros</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--green)">
        <div class="kpi-val">${stats.active_ms}</div>
        <div class="kpi-lbl">Membresías Activas</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--orange)">
        <div class="kpi-val">${CFG.currency}${(stats.month_revenue||0).toLocaleString()}</div>
        <div class="kpi-lbl">Ingresos del Mes</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--purple)">
        <div class="kpi-val">${avgPerDay}</div>
        <div class="kpi-lbl">Asistencia Promedio/Día</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--yellow)">
        <div class="kpi-val">${expiringSoon}</div>
        <div class="kpi-lbl">Membresías por Vencer (7d)</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.face_registered}</div>
        <div class="kpi-lbl">Con Reconocimiento Facial</div>
      </div>
    `;

    // ── Gráfico 1: Asistencia diaria (línea) ──────────────────
    const attLabels = [], attData = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d  = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const label = days <= 14
        ? d.getDate() + '/' + (d.getMonth() + 1)
        : (i % Math.ceil(days / 10) === 0 ? d.getDate() + '/' + (d.getMonth() + 1) : '');
      attLabels.push(label);
      attData.push(attStats[ds] || 0);
    }
    const attCtx = document.getElementById('att-chart');
    if (charts.att) charts.att.destroy();
    charts.att = new Chart(attCtx, {
      type: 'line',
      data: {
        labels: attLabels,
        datasets: [{
          label: 'Asistencias',
          data: attData,
          borderColor: 'rgba(0,212,255,1)',
          backgroundColor: 'rgba(0,212,255,.08)',
          fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: (items) => 'Fecha: ' + (attLabels[items[0].dataIndex] || ''),
          label: (item) => 'Asistencias: ' + item.raw,
        }}},
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', maxRotation: 0 }},
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', stepSize: 1 }, beginAtZero: true },
        },
      }
    });

    // ── Gráfico 2: Ingresos mensuales (barras) ────────────────
    const revLabels = [], revData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now); d.setMonth(d.getMonth() - i); d.setDate(1);
      revLabels.push(MONTHS[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2));
      const rev = pays
        .filter(p => { const pd = new Date(p.date); return pd.getFullYear()===d.getFullYear() && pd.getMonth()===d.getMonth(); })
        .reduce((s, p) => s + p.amount, 0);
      revData.push(rev);
    }
    const revCtx = document.getElementById('rev-chart');
    if (charts.rev) charts.rev.destroy();
    charts.rev = new Chart(revCtx, {
      type: 'bar',
      data: {
        labels: revLabels,
        datasets: [{
          label: 'Ingresos',
          data: revData,
          backgroundColor: revData.map((_, i) => i === revData.length - 1 ? 'rgba(255,107,0,.9)' : 'rgba(255,107,0,.45)'),
          borderColor: 'rgba(255,107,0,1)',
          borderWidth: 2, borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: (item) => CFG.currency + item.raw.toLocaleString(),
        }}},
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0' }},
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', callback: v => CFG.currency + v.toLocaleString() }, beginAtZero: true },
        },
      }
    });

    // ── Gráfico 3: Distribución por plan (dona) ───────────────
    const planCounts = {};
    PLANS.forEach(p => { planCounts[p.id] = 0; });
    ms.filter(m => m.active).forEach(m => { if (planCounts[m.plan_id] !== undefined) planCounts[m.plan_id]++; });
    const planCtx = document.getElementById('plan-chart');
    if (charts.plan) charts.plan.destroy();
    charts.plan = new Chart(planCtx, {
      type: 'doughnut',
      data: {
        labels: PLANS.map(p => p.name),
        datasets: [{
          data: PLANS.map(p => planCounts[p.id] || 0),
          backgroundColor: ['rgba(255,107,0,.85)','rgba(0,212,255,.85)','rgba(0,229,160,.85)','rgba(170,85,255,.85)','rgba(255,209,102,.85)'],
          borderColor: 'var(--s1)', borderWidth: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#8890c0', padding: 14, boxWidth: 14 }},
          tooltip: { callbacks: { label: (item) => ` ${item.label}: ${item.raw} miembro${item.raw !== 1 ? 's' : ''}` }}
        },
      }
    });

    // ── Gráfico 4: Horas pico (barras horizontales) ───────────
    const hourLabels = Array.from({length: 24}, (_,h) => h + ':00');
    const hourData   = hourLabels.map((_, h) => byHour[String(h)] || 0);
    const maxHour    = Math.max(...hourData);
    const hourCtx    = document.getElementById('hour-chart');
    if (hourCtx) {
      if (charts.hour) charts.hour.destroy();
      charts.hour = new Chart(hourCtx, {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [{
            label: 'Asistencias',
            data: hourData,
            backgroundColor: hourData.map(v => {
              const intensity = maxHour > 0 ? v / maxHour : 0;
              return `rgba(0,229,160,${0.15 + intensity * 0.75})`;
            }),
            borderColor: 'rgba(0,229,160,.6)',
            borderWidth: 1, borderRadius: 3,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: (item) => 'Asistencias: ' + item.raw,
          }}},
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', maxRotation: 0,
              callback: (_, i) => [6,8,10,12,14,16,18,20,22].includes(i) ? hourLabels[i] : '',
            }},
            y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', stepSize: 1 }, beginAtZero: true },
          },
        }
      });
    }

    // ── Top miembros más asiduos ───────────────────────────────
    const topEl = document.getElementById('rep-top-members');
    if (topEl) {
      if (!topMembers.length) {
        topEl.innerHTML = '<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px">Sin datos en este período</div>';
      } else {
        const maxCount = topMembers[0]?.count || 1;
        topEl.innerHTML = topMembers.map((m, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--b1)">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;color:var(--t3);width:22px;text-align:center">${i + 1}</div>
            <div style="width:32px;height:32px;border-radius:50%;background:var(--s3);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;overflow:hidden">
              ${m.avatar ? `<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover">` : m.member_name[0]}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.member_name}</div>
              <div style="height:4px;background:var(--s3);border-radius:2px;margin-top:4px">
                <div style="height:100%;width:${Math.round(m.count/maxCount*100)}%;background:var(--cyan);border-radius:2px;transition:width .4s"></div>
              </div>
            </div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:var(--cyan)">${m.count}</div>
          </div>`).join('');
      }
    }

  } catch(e) { toast('Error en reportes: ' + e.message, 'er'); }
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════
async function loadSettings() {
  try {
    const s = await GET('/settings');
    CFG = { ...CFG, currency: s.currency||'S/', gymName: s.gymName||'GymOS', faceThreshold: parseFloat(s.faceThreshold)||0.45, checkinCooldown: parseInt(s.checkinCooldown)||3600 };
    document.getElementById('set-name').value  = s.gymName||'';
    document.getElementById('set-phone').value = s.phone||'';
    document.getElementById('set-addr').value  = s.address||'';
    document.getElementById('set-currency').value = s.currency||'S/';
    document.getElementById('set-tz').value    = s.timezone||'-5';
    document.getElementById('set-thresh').value = s.faceThreshold||0.45;
    document.getElementById('thresh-val').textContent = s.faceThreshold||0.45;
    document.getElementById('set-cooldown').value = s.checkinCooldown||3600;
    document.getElementById('gym-av').textContent = (s.gymName||'G')[0].toUpperCase();
  } catch {}
}

async function saveSettings() {
  const data = {
    gymName: document.getElementById('set-name').value,
    phone:   document.getElementById('set-phone').value,
    address: document.getElementById('set-addr').value,
    currency:document.getElementById('set-currency').value,
    timezone:document.getElementById('set-tz').value,
    faceThreshold: document.getElementById('set-thresh').value,
    checkinCooldown: document.getElementById('set-cooldown').value,
    togWelcome: document.getElementById('tog-welcome')?.checked ? 'true' : 'false',
    togRenew:   document.getElementById('tog-renew')?.checked   ? 'true' : 'false',
    togOpen:    document.getElementById('tog-open')?.checked    ? 'true' : 'false',
    togClose:   document.getElementById('tog-close')?.checked   ? 'true' : 'false',
  };
  await PUT('/settings', data);
  CFG.currency = data.currency;
  document.getElementById('gym-av').textContent = (data.gymName||'G')[0].toUpperCase();
  toast('✅ Configuración guardada','ok');
}

function exportDB() { window.open(window.location.origin + '/api/export','_blank'); }
function importDB() { document.getElementById('import-file').click(); }
async function doImport(input) {
  const file = input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      await POST('/import', JSON.parse(e.target.result));
      toast('Datos importados ✓','ok');
    } catch(e2) { toast('Error importando: '+e2.message,'er'); }
  };
  r.readAsText(file);
}

// ══════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════
function openModal(title, body, actions=[], wide=false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-box').className = 'modal' + (wide?' wide':'');
  document.getElementById('modal-foot').innerHTML =
    `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>` +
    actions.map((a,i)=>`<button class="btn ${a.cls||'btn-ghost'}" id="ma${i}">${a.label}</button>`).join('');
  actions.forEach((a,i) => document.getElementById('ma'+i).addEventListener('click', a.fn));
  document.getElementById('overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  stopQFCam();
}
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function toast(msg, type='in', dur=3500) {
  const t = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'ti ' + type; el.textContent = msg;
  t.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, dur);
}

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
async function boot() {
  setInterval(tick, 1000); tick();

  const ok = await pingServer();
  if (ok) {
    try {
      const cfg = await GET('/settings');
      CFG.currency = cfg.currency||'S/';
      CFG.gymName  = cfg.gymName||'GymOS';
      CFG.faceThreshold = parseFloat(cfg.faceThreshold)||0.45;
      CFG.checkinCooldown = parseInt(cfg.checkinCooldown)||3600;
      document.getElementById('gym-av').textContent = (cfg.gymName||'G')[0].toUpperCase();

      PLANS   = await GET('/plans');
      MEMBERS = await GET('/members');
      ANNS    = await GET('/announcements');

      await checkFaceStatus();
      renderDashboard();
      toast('✅ GymOS conectado al servidor','ok');
    } catch(e) { toast('Error inicial: '+e.message,'er'); }
  } else {
    toast('⚠ Servidor no disponible en localhost:8000','wa', 6000);
    document.getElementById('face-pill').className='tb-pill err';
    document.getElementById('face-pill').textContent='✕ Sin servidor';
  }

  // Periodic ping
  setInterval(async () => {
    await pingServer();
    checkFaceStatus();
  }, 30000);
}

// boot() is now called after auth (see above)

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════
let AUTH_TOKEN = sessionStorage.getItem('gymos_token') || '';
let CURRENT_USER = null;

const ROLE_NAMES = {
  superadmin:  '★ Superadmin',
  admin:       '● Admin',
  recepcion:   '◎ Recepción',
  visualizador:'◌ Visualizador',
};

const ROLE_PERMS = {
  superadmin:  ['all'],
  admin:       ['dashboard','attendance','register','members','memberships','payments','announcements','reports','settings','profiles'],
  recepcion:   ['dashboard','attendance','members','memberships','payments','announcements'],
  visualizador:['dashboard','reports'],
};

function canAccess(view) {
  if (!CURRENT_USER) return false;
  const perms = ROLE_PERMS[CURRENT_USER.role] || [];
  return perms.includes('all') || perms.includes(view);
}

// Override original api() to always inject Authorization header
const _originalFetch = window.fetch.bind(window);
window.fetch = function(url, opts = {}) {
  if (AUTH_TOKEN && typeof url === 'string' && url.includes('/api/')) {
    opts.headers = { ...(opts.headers||{}), 'Authorization': 'Bearer ' + AUTH_TOKEN };
  }
  return _originalFetch(url, opts);
};

async function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  if (!user || !pass) return;
  const btn = document.getElementById('l-btn');
  const err = document.getElementById('l-err');
  btn.disabled = true;
  document.getElementById('l-btn-txt').textContent = 'Verificando...';
  err.style.display = 'none';
  try {
    const res = await _originalFetch(window.location.origin + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      throw new Error(e.detail || 'Credenciales incorrectas');
    }
    const data = await res.json();
    AUTH_TOKEN = data.token;
    CURRENT_USER = data.user;
    sessionStorage.setItem('gymos_token', AUTH_TOKEN);
    sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
    showApp();
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    document.getElementById('l-btn-txt').textContent = 'Iniciar Sesión';
  }
}

function togglePassVis() {
  const inp = document.getElementById('l-pass');
  const eye = document.getElementById('l-eye');
  if (inp.type === 'password') { inp.type = 'text'; eye.textContent = '🙈'; }
  else { inp.type = 'password'; eye.textContent = '👁'; }
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  updateUserUI();
  hideForbiddenNavItems();
  boot();
}

function updateUserUI() {
  if (!CURRENT_USER) return;
  // Topbar avatar
  const av = document.getElementById('gym-av');
  if (av) {
    if (CURRENT_USER.avatar) {
      av.innerHTML = `<img src="${CURRENT_USER.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      av.textContent = (CURRENT_USER.display_name || CURRENT_USER.username)[0].toUpperCase();
    }
  }
  // User menu
  const nameEl = document.getElementById('umd-name');
  const roleEl = document.getElementById('umd-role-badge');
  if (nameEl) nameEl.textContent = CURRENT_USER.display_name || CURRENT_USER.username;
  if (roleEl) {
    roleEl.textContent = ROLE_NAMES[CURRENT_USER.role] || CURRENT_USER.role;
    roleEl.className = 'badge role-' + CURRENT_USER.role;
  }
}

function hideForbiddenNavItems() {
  document.querySelectorAll('.sb-item[data-view]').forEach(el => {
    const view = el.dataset.view;
    if (!canAccess(view)) {
      el.style.display = 'none';
    }
  });
}

function toggleUserMenu() {
  document.getElementById('user-menu-drop')?.classList.toggle('open');
}
function closeUserMenu() {
  document.getElementById('user-menu-drop')?.classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-menu-wrap')) closeUserMenu();
});

function doLogout() {
  AUTH_TOKEN = '';
  CURRENT_USER = null;
  sessionStorage.removeItem('gymos_token');
  sessionStorage.removeItem('gymos_user');
  document.getElementById('login-screen').style.display = 'flex';
  // Clear camera
  if (typeof stopCam === 'function') stopCam();
}

function openMyProfile() {
  if (!CURRENT_USER) return;
  openModal('👤 Mi Perfil', `
    <div style="text-align:center;margin-bottom:18px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--s3);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px;font-family:'Barlow Condensed',sans-serif;font-weight:900;overflow:hidden;border:2px solid var(--b2)">
        ${CURRENT_USER.avatar ? `<img src="${CURRENT_USER.avatar}" style="width:100%;height:100%;object-fit:cover">` : (CURRENT_USER.display_name||CURRENT_USER.username)[0].toUpperCase()}
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800">${CURRENT_USER.display_name}</div>
      <div style="font-size:12px;color:var(--t2)">@${CURRENT_USER.username} · ${CURRENT_USER.email||'Sin email'}</div>
      <span class="badge role-${CURRENT_USER.role}" style="margin-top:8px">${ROLE_NAMES[CURRENT_USER.role]||CURRENT_USER.role}</span>
    </div>
    <div class="fgrid">
      <div class="fg"><label>Nombre a mostrar</label><input id="mp-name" value="${CURRENT_USER.display_name||''}"></div>
      <div class="fg"><label>Email</label><input id="mp-email" value="${CURRENT_USER.email||''}"></div>
    </div>`,
    [{label:'Guardar', cls:'btn-primary', fn: async () => {
      await PUT('/admin-users/'+CURRENT_USER.id, {
        display_name: document.getElementById('mp-name').value,
        email: document.getElementById('mp-email').value,
      });
      CURRENT_USER.display_name = document.getElementById('mp-name').value;
      sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
      updateUserUI();
      closeModal(); toast('Perfil actualizado','ok');
    }}]);
}

function openChangePass() {
  openModal('🔑 Cambiar Contraseña', `
    <div class="fg" style="margin-bottom:10px"><label>Contraseña Actual</label><input type="password" id="cp-cur" placeholder="••••••••"></div>
    <div class="fg" style="margin-bottom:10px"><label>Nueva Contraseña</label><input type="password" id="cp-new" placeholder="••••••••"></div>
    <div class="fg"><label>Confirmar Nueva</label><input type="password" id="cp-con" placeholder="••••••••"></div>`,
    [{label:'Cambiar', cls:'btn-primary', fn: async () => {
      const np = document.getElementById('cp-new').value;
      const cn = document.getElementById('cp-con').value;
      if (np !== cn) { toast('Las contraseñas no coinciden','wa'); return; }
      if (np.length < 6) { toast('Mínimo 6 caracteres','wa'); return; }
      try {
        await POST('/auth/change-password', {
          current_password: document.getElementById('cp-cur').value,
          new_password: np,
        });
        closeModal(); toast('✅ Contraseña actualizada','ok');
      } catch(e) { toast('Error: '+e.message,'er'); }
    }}]);
}

// ══════════════════════════════════════════════════════════════
//  PROFILES / ADMIN USERS
// ══════════════════════════════════════════════════════════════
let ADMIN_USERS = [];
const ROLE_COLORS = {
  superadmin: '#ff6b00', admin: '#00d4ff', recepcion: '#00e5a0', visualizador: '#8890c0'
};

async function loadAndRenderProfiles() {
  try {
    ADMIN_USERS = await GET('/admin-users');
    renderProfiles();
  } catch(e) {
    if (e.message?.includes('403') || e.message?.includes('401')) {
      document.getElementById('profile-grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">🔒</div><div class="etxt">Sin permisos para ver usuarios</div></div>';
    } else {
      toast('Error cargando usuarios: '+e.message,'er');
    }
  }
}

function renderProfiles() {
  const grid = document.getElementById('profile-grid');
  if (!ADMIN_USERS.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">👤</div><div class="etxt">Sin usuarios</div></div>';
    return;
  }
  grid.innerHTML = ADMIN_USERS.map(u => {
    const roleColor = ROLE_COLORS[u.role] || '#8890c0';
    const isSelf = CURRENT_USER && u.id === CURRENT_USER.id;
    const canEdit = CURRENT_USER && (CURRENT_USER.role === 'superadmin' || CURRENT_USER.role === 'admin');
    const canDel  = CURRENT_USER && CURRENT_USER.role === 'superadmin' && !isSelf;
    return `<div class="pcard">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${roleColor};border-radius:var(--r2) var(--r2) 0 0"></div>
      ${canEdit ? `<div class="pcard-acts">
        <button class="btn btn-icon btn-ghost" onclick="editProfile('${u.id}')">✏</button>
        ${canDel ? `<button class="btn btn-icon btn-danger" onclick="deleteProfile('${u.id}')">✕</button>` : ''}
      </div>` : ''}
      <div class="pcard-av" style="border-color:${roleColor}20;background:${roleColor}15">
        ${u.avatar ? `<img src="${u.avatar}">` : `<span style="color:${roleColor}">${(u.display_name||u.username)[0].toUpperCase()}</span>`}
      </div>
      <div class="pcard-name">${u.display_name || u.username} ${isSelf ? '<span style="font-size:11px;color:var(--t2)">(Tú)</span>' : ''}</div>
      <div class="pcard-user">@${u.username}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span class="badge role-${u.role}">${ROLE_NAMES[u.role]||u.role}</span>
        ${!u.active ? '<span class="badge br">Inactivo</span>' : ''}
      </div>
      ${u.last_login ? `<div style="font-size:11px;color:var(--t3);margin-top:6px">Último acceso: ${new Date(u.last_login).toLocaleDateString('es')}</div>` : ''}
    </div>`;
  }).join('');

  // Hide add button if not admin
  const btn = document.getElementById('add-profile-btn');
  if (btn) btn.style.display = CURRENT_USER?.role === 'superadmin' || CURRENT_USER?.role === 'admin' ? '' : 'none';
}

function openProfileModal(id=null) {
  const u = id ? ADMIN_USERS.find(x=>x.id===id) : null;
  const isSuperAdmin = CURRENT_USER?.role === 'superadmin';
  openModal(id ? '✏ Editar Usuario' : '✚ Nuevo Usuario', `
    <div class="fgrid">
      <div class="fg"><label>Nombre a Mostrar *</label><input id="pu-name" value="${u?.display_name||''}"></div>
      <div class="fg"><label>Usuario (login) *</label><input id="pu-user" value="${u?.username||''}" ${id?'readonly style="opacity:.6"':''}></div>
      <div class="fg"><label>Email</label><input id="pu-email" value="${u?.email||''}"></div>
      <div class="fg"><label>Contraseña ${id?'(dejar vacío = no cambiar)':'*'}</label><input type="password" id="pu-pass" placeholder="${id?'Nueva contraseña...':'Mínimo 6 caracteres'}"></div>
      ${isSuperAdmin ? `<div class="fg"><label>Rol</label>
        <select id="pu-role">
          <option value="superadmin" ${u?.role==='superadmin'?'selected':''}>★ Superadmin — acceso total</option>
          <option value="admin" ${u?.role==='admin'?'selected':''}>● Admin — gestión completa</option>
          <option value="recepcion" ${u?.role==='recepcion'||!u?'selected':''}>◎ Recepción — check-in y miembros</option>
          <option value="visualizador" ${u?.role==='visualizador'?'selected':''}>◌ Visualizador — solo lectura</option>
        </select>
      </div>` : `<input type="hidden" id="pu-role" value="${u?.role||'recepcion'}">`}
      <div class="fg"><label>Estado</label>
        <select id="pu-active"><option value="true" ${u?.active!==false?'selected':''}>Activo</option><option value="false" ${u?.active===false?'selected':''}>Inactivo</option></select>
      </div>
    </div>
    <div style="margin-top:10px;padding:10px 12px;background:var(--s2);border-radius:var(--r);font-size:12px;color:var(--t2);border:1px solid var(--b1)">
      <strong style="color:var(--text)">Permisos por rol:</strong><br>
      ★ Superadmin: Todo + gestión de usuarios<br>
      ● Admin: Operaciones + configuración<br>
      ◎ Recepción: Check-in, miembros, pagos<br>
      ◌ Visualizador: Solo ver dashboard y reportes
    </div>`,
    [{label: id ? 'Guardar Cambios' : 'Crear Usuario', cls:'btn-primary', fn: async () => {
      const name = document.getElementById('pu-name').value.trim();
      const user = document.getElementById('pu-user').value.trim();
      const pass = document.getElementById('pu-pass').value;
      if (!name || !user) { toast('Nombre y usuario son requeridos','wa'); return; }
      if (!id && pass.length < 6) { toast('Contraseña mínimo 6 caracteres','wa'); return; }
      const payload = {
        display_name: name,
        username: user,
        email: document.getElementById('pu-email').value,
        role: document.getElementById('pu-role').value,
        active: document.getElementById('pu-active').value === 'true',
      };
      if (pass) payload.password = pass;
      try {
        if (id) await PUT('/admin-users/'+id, payload);
        else await POST('/admin-users', payload);
        closeModal(); loadAndRenderProfiles();
        toast(id ? 'Usuario actualizado' : 'Usuario creado','ok');
      } catch(e) { toast('Error: '+e.message,'er'); }
    }}]);
}

function editProfile(id) { openProfileModal(id); }

async function deleteProfile(id) {
  const u = ADMIN_USERS.find(x=>x.id===id);
  if (!confirm(`¿Desactivar usuario "${u?.display_name||u?.username}"?`)) return;
  try {
    await DEL('/admin-users/'+id);
    loadAndRenderProfiles();
    toast('Usuario desactivado','in');
  } catch(e) { toast('Error: '+e.message,'er'); }
}

// ══════════════════════════════════════════════════════════════
//  AUDIO FILES
// ══════════════════════════════════════════════════════════════
let AUDIO_FILES = [];
let currentAudio = null;

async function loadAudioFiles() {
  try {
    AUDIO_FILES = await GET('/audio-files');
    renderAudioList();
  } catch { renderAudioList(); }
}

function renderAudioList() {
  const el = document.getElementById('audio-file-list');
  if (!el) return;
  if (!AUDIO_FILES.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--t3);text-align:center;padding:10px">Sin archivos de audio subidos</div>';
    return;
  }
  el.innerHTML = AUDIO_FILES.map(f => `
    <div class="audio-item" id="afi-${f.id}">
      <div class="audio-icon">🎵</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
        <div style="font-size:11px;color:var(--t2)">${f.size_kb} KB · ${f.filename.split('.').pop().toUpperCase()}</div>
      </div>
      <div class="audio-wave paused" id="aw-${f.id}">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-icon btn-cyan" onclick="playAudioFile('${f.id}','${f.url}','${f.name}')" title="Reproducir">▶</button>
        <button class="btn btn-icon btn-ghost" onclick="scheduleAudioFile('${f.id}','${f.name}')" title="Programar">⏰</button>
        <button class="btn btn-icon btn-danger" onclick="deleteAudioFile('${f.id}')" title="Eliminar">✕</button>
      </div>
    </div>`).join('');
}

function playAudioFile(id, url, name) {
  // Stop previous
  if (currentAudio) {
    currentAudio.pause();
    // Reset all waves
    document.querySelectorAll('.audio-wave').forEach(w => w.classList.add('paused'));
  }
  const fullUrl = window.location.origin + url;
  currentAudio = new Audio(fullUrl);
  const wave = document.getElementById('aw-'+id);
  if (wave) wave.classList.remove('paused');
  currentAudio.play().catch(e => toast('Error reproduciendo: '+e.message,'er'));
  currentAudio.onended = () => { if (wave) wave.classList.add('paused'); };
  toast('▶ Reproduciendo: '+name,'in');
}

async function deleteAudioFile(id) {
  if (!confirm('¿Eliminar este archivo de audio?')) return;
  await DEL('/audio-files/'+id);
  AUDIO_FILES = AUDIO_FILES.filter(f=>f.id!==id);
  renderAudioList();
  toast('Audio eliminado','in');
}

function scheduleAudioFile(id, name) {
  const ALL = ['lun','mar','mié','jue','vie','sáb','dom'];
  openModal('⏰ Programar Audio: '+name, `
    <p style="font-size:12px;color:var(--t2);margin-bottom:14px">El archivo de audio se reproducirá automáticamente en el horario indicado.</p>
    <div class="fg" style="margin-bottom:10px"><label>Hora</label><input type="time" id="sa-time" value="08:00"></div>
    <div class="fg">
      <label>Días</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
        ${ALL.map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="sad-${d}" checked>${d}</label>`).join('')}
      </div>
    </div>`,
    [{label:'Programar', cls:'btn-primary', fn: async () => {
      const days = ALL.filter(d=>document.getElementById('sad-'+d)?.checked);
      await POST('/announcements', {
        text: '__audio__' + id,  // special prefix: backend/frontend will play audio instead of TTS
        time: document.getElementById('sa-time').value,
        days, active: true,
      });
      closeModal();
      ANNS = await GET('/announcements');
      renderAnnList();
      toast('Audio programado ✓','ok');
    }}]);
}

async function uploadAudioFile(input) {
  const file = input.files[0]; if (!file) return;
  const name = prompt('Nombre para este audio:', file.name.replace(/\.[^.]+$/,''));
  if (!name) return;
  const formData = new FormData();
  formData.append('name', name);
  formData.append('file', file);
  try {
    toast('⏳ Subiendo audio...','in');
    const res = await fetch(window.location.origin + '/api/audio-files/upload', {
      method:'POST',
      headers: { 'Authorization': 'Bearer '+AUTH_TOKEN },
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const af = await res.json();
    AUDIO_FILES.unshift(af);
    renderAudioList();
    toast('✅ Audio subido: '+name,'ok');
  } catch(e) { toast('Error: '+e.message,'er'); }
  input.value = '';
}

// ══════════════════════════════════════════════════════════════
//  IMPROVED TTS
// ══════════════════════════════════════════════════════════════
const QUICK_MSGS = {
  '🚪 Cierre en 30 min': 'Estimados miembros, les informamos que el gimnasio cerrará sus puertas en 30 minutos. Les pedimos que vayan concluyendo su entrenamiento. Gracias por su comprensión.',
  '🌅 Buenos días':      'Buenos días a todos nuestros miembros. Bienvenidos al gimnasio. Que tengan una excelente sesión de entrenamiento el día de hoy.',
  '🌙 Buenas noches':    'Buenas noches estimados miembros. Gracias por visitarnos hoy. Los esperamos mañana. ¡Que descansen bien!',
  '🧹 Limpieza en curso':'Estimados miembros, en este momento se está realizando limpieza en el área de pesas. Por favor, tengan cuidado al transitar por esa zona. Gracias.',
  '🏋 Hora pico':        'Atención miembros, actualmente nos encontramos en hora de alta concurrencia. Les pedimos amablemente compartir los equipos y respetar los turnos. Muchas gracias.',
};

function setQuickMsg(el) {
  document.querySelectorAll('.tts-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const msg = QUICK_MSGS[el.textContent] || el.textContent;
  document.getElementById('ann-instant').value = msg;
}

// Override original speak() for better quality
function speak(text, opts={}) {
  // Check if it's an audio file reference
  if (text && text.startsWith('__audio__')) {
    const audioId = text.replace('__audio__','');
    const af = AUDIO_FILES.find(f=>f.id===audioId);
    if (af) { playAudioFile(af.id, af.url, af.name); return; }
  }
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = 'es-PE';
  const sel = document.getElementById('ann-voice');
  if (sel && voices.length) u.voice = voices[parseInt(sel.value)||0];
  const rateEl  = document.getElementById('ann-rate');
  const pitchEl = document.getElementById('ann-pitch');
  const volEl   = document.getElementById('ann-vol');
  u.rate   = rateEl  ? parseFloat(rateEl.value)  : 0.9;
  u.pitch  = pitchEl ? parseFloat(pitchEl.value) : 1.0;
  u.volume = volEl   ? parseFloat(volEl.value)   : 1.0;
  synth.speak(u);
}

// ══════════════════════════════════════════════════════════════
//  OVERRIDE NAV to check auth
// ══════════════════════════════════════════════════════════════
const _originalNav = nav;
window.nav = function(id) {
  if (!CURRENT_USER) { toast('Inicia sesión primero','wa'); return; }
  if (!canAccess(id)) { toast('Sin permisos para esta sección','wa'); return; }
  _originalNav(id);
  if (id === 'profiles') loadAndRenderProfiles();
  if (id === 'announcements') { loadAudioFiles(); }
};

// Add to VIEWS
VIEWS['profiles'] = ['Usuarios del Sistema','Gestión de perfiles y accesos'];

// ══════════════════════════════════════════════════════════════
//  BOOT OVERRIDE - Check stored session
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Try to restore session
  const storedToken = sessionStorage.getItem('gymos_token');
  const storedUser  = sessionStorage.getItem('gymos_user');
  if (storedToken && storedUser) {
    try {
      AUTH_TOKEN   = storedToken;
      CURRENT_USER = JSON.parse(storedUser);
      // Verify token is still valid
      const res = await _originalFetch(window.location.origin + '/api/auth/verify', {
        method:'POST',
        headers:{'Authorization':'Bearer '+storedToken,'Content-Type':'application/json'},
        body:'{}',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        CURRENT_USER = data.user;
        sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
        showApp();
        return;
      }
    } catch {}
    // Token invalid
    sessionStorage.removeItem('gymos_token');
    sessionStorage.removeItem('gymos_user');
  }
  // Show login
  document.getElementById('login-screen').style.display = 'flex';
});


// ══════════════════════════════════════════════════════════════
//  PROMOTIONS
// ══════════════════════════════════════════════════════════════

let _editingPromoId = null;

// ── Helpers ───────────────────────────────────────────────────
function _fmtCountdown(seconds) {
  if (seconds <= 0) return '00:00:00';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return [h,m,s].map(n => String(n).padStart(2,'0')).join(':');
}

function _promoStatusBadge(p) {
  if (!p.active)      return '<span class="badge" style="background:rgba(255,255,255,.05);color:var(--t2)">Desactivada</span>';
  if (!p.now_active) {
    const now = new Date();
    const start = new Date(p.start_date + 'T' + p.start_time);
    if (start > now) return '<span class="badge" style="background:rgba(0,212,255,.1);color:var(--cyan)">Próximamente</span>';
    return '<span class="badge" style="background:rgba(239,71,111,.1);color:var(--red)">Expirada</span>';
  }
  return '<span class="badge" style="background:rgba(0,229,160,.15);color:var(--green);animation:pulse 2s infinite">● Activa</span>';
}

function _discountLabel(p) {
  return p.discount_type === 'percent'
    ? `${p.discount_value}% OFF`
    : `${CFG.currency}${p.discount_value} OFF`;
}

// ── Load & Render ──────────────────────────────────────────────
async function loadPromotions() {
  // Clear old countdown timers
  Object.values(PROMO_TIMERS).forEach(clearInterval);
  PROMO_TIMERS = {};

  try {
    PROMOTIONS = await GET('/promotions');
    renderPromoGrid();
    renderPromoBanners();
    updatePromoSidebarBadge();
  } catch(e) { toast('Error cargando promociones: ' + e.message, 'er'); }
}

function renderPromoGrid() {
  const grid = document.getElementById('promo-grid');
  if (!grid) return;

  if (!PROMOTIONS.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="eico">🏷️</div>
      <div class="etxt">Sin promociones creadas</div>
      <div class="esub">Crea tu primera promoción para atraer nuevos miembros</div>
    </div>`;
    return;
  }

  // Sort: active first, then upcoming, then expired
  const sorted = [...PROMOTIONS].sort((a, b) => {
    const score = p => p.now_active ? 2 : (p.active ? 1 : 0);
    return score(b) - score(a);
  });

  grid.innerHTML = sorted.map(p => _promoCard(p)).join('');

  // Start countdown timers for active promos
  sorted.filter(p => p.now_active && p.seconds_left > 0).forEach(p => {
    let secs = p.seconds_left;
    PROMO_TIMERS[p.id] = setInterval(() => {
      secs--;
      const el = document.getElementById(`cd-${p.id}`);
      if (el) el.textContent = _fmtCountdown(secs);
      if (secs <= 0) {
        clearInterval(PROMO_TIMERS[p.id]);
        loadPromotions(); // refresh when expired
      }
    }, 1000);
  });
}

function _promoCard(p) {
  const isActive   = p.now_active;
  const borderColor = isActive ? 'var(--orange)' : 'var(--b1)';
  const plans       = p.plan_names.length ? p.plan_names.join(', ') : 'Todos los planes';
  const usesInfo    = p.uses_limit > 0
    ? `${p.uses_count} / ${p.uses_limit} usos`
    : `${p.uses_count} usos (ilimitado)`;
  const usesBar = p.uses_limit > 0
    ? `<div style="height:3px;background:var(--s3);border-radius:2px;margin-top:4px">
         <div style="height:100%;width:${Math.round(p.uses_count/p.uses_limit*100)}%;background:var(--orange);border-radius:2px;transition:width .4s"></div>
       </div>` : '';

  return `<div class="panel" style="border:1px solid ${borderColor};position:relative;overflow:hidden">
    ${isActive ? `<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--orange),var(--yellow))"></div>` : ''}
    <div style="padding:14px 16px">

      <!-- Top row -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          ${p.description ? `<div style="font-size:12px;color:var(--t2);margin-top:2px">${p.description}</div>` : ''}
        </div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--orange);flex-shrink:0">${_discountLabel(p)}</div>
      </div>

      <!-- Status + countdown -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        ${_promoStatusBadge(p)}
        ${p.code ? `<span class="badge" style="background:rgba(170,85,255,.1);color:#aa55ff;font-family:monospace;letter-spacing:1px">${p.code}</span>` : ''}
        ${isActive ? `<span style="font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:var(--yellow)" id="cd-${p.id}">${_fmtCountdown(p.seconds_left)}</span>` : ''}
      </div>

      <!-- Details -->
      <div style="font-size:11px;color:var(--t2);display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px">
        <div>📅 ${p.start_date} ${p.start_time}</div>
        <div>⏰ ${p.end_date} ${p.end_time}</div>
        <div>📋 ${plans}</div>
        <div>🔢 ${usesInfo}</div>
      </div>
      ${usesBar}

      <!-- Actions -->
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-s" style="flex:1" onclick="editPromo('${p.id}')">✏️ Editar</button>
        <button class="btn-s" style="flex:1;color:var(--orange)"
          onclick="togglePromo('${p.id}', ${!p.active})">${p.active ? '⏸ Pausar' : '▶ Activar'}</button>
        <button class="btn-s" style="color:var(--red)"
          onclick="deletePromo('${p.id}', '${p.name.replace(/'/g,'\\\'')}')"  >🗑</button>
      </div>
    </div>
  </div>`;
}

// Render active-promo banners at top of other views (optional integration)
function renderPromoBanners() {
  const active = PROMOTIONS.filter(p => p.now_active);
  const strip  = document.getElementById('promo-banners');
  if (!strip) return;
  if (!active.length) { strip.style.display = 'none'; return; }
  strip.style.display = 'flex';
  strip.innerHTML = active.map(p => `
    <div style="background:linear-gradient(135deg,rgba(255,107,0,.15),rgba(255,209,102,.1));border:1px solid rgba(255,107,0,.3);border-radius:var(--r);padding:8px 14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">🏷️</span>
      <div>
        <div style="font-weight:700;font-size:13px">${p.name} — ${_discountLabel(p)}</div>
        <div style="font-size:11px;color:var(--t2)">Vence: ${p.end_date} ${p.end_time}</div>
      </div>
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:var(--yellow)" id="banner-cd-${p.id}">${_fmtCountdown(p.seconds_left)}</span>
    </div>`).join('');
}

function updatePromoSidebarBadge() {
  const badge  = document.getElementById('sb-promo-active');
  const active = PROMOTIONS.filter(p => p.now_active).length;
  if (badge) badge.style.display = active > 0 ? 'inline-block' : 'none';
}

// ── Modal CRUD — usa el overlay nativo del sistema ───────────
function _promoFormHTML() {
  const plansHtml = PLANS.map(pl => `
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:5px 10px;background:var(--s2);border-radius:6px;border:1px solid var(--b1)">
      <input type="checkbox" data-plan-id="${pl.id}" style="accent-color:var(--orange)"> ${pl.icon||''} ${pl.name}
    </label>`).join('');

  return `
  <div class="fgrid">
    <div class="fg full"><label>Nombre *</label>
      <input id="pm-name" placeholder="Ej: Oferta Año Nuevo 30% OFF"></div>
    <div class="fg full"><label>Descripción</label>
      <input id="pm-desc" placeholder="Ej: Válida solo para nuevos miembros"></div>

    <div class="fg"><label>Tipo de Descuento</label>
      <select id="pm-type" onchange="updatePromoPreview()">
        <option value="percent">Porcentaje (%)</option>
        <option value="fixed">Monto Fijo (${CFG.currency})</option>
      </select></div>
    <div class="fg"><label>Valor</label>
      <input id="pm-value" type="number" min="0" step="0.5" placeholder="Ej: 25" oninput="updatePromoPreview()"></div>

    <div class="fg"><label>Fecha Inicio *</label>
      <input id="pm-start-date" type="date"></div>
    <div class="fg"><label>Fecha Fin *</label>
      <input id="pm-end-date" type="date"></div>
    <div class="fg"><label>Hora Inicio</label>
      <input id="pm-start-time" type="time" value="00:00"></div>
    <div class="fg"><label>Hora Fin</label>
      <input id="pm-end-time" type="time" value="23:59"></div>

    <div class="fg"><label>Código <span style="color:var(--t3);font-size:11px">(opcional)</span></label>
      <input id="pm-code" placeholder="Ej: VERANO25"
             oninput="this.value=this.value.toUpperCase()" style="text-transform:uppercase"></div>
    <div class="fg"><label>Límite de Usos <span style="color:var(--t3);font-size:11px">(0=ilimitado)</span></label>
      <input id="pm-limit" type="number" min="0" value="0"></div>

    <div class="fg full"><label>Aplica a Planes <span style="color:var(--t3);font-size:11px">(vacío = todos)</span></label>
      <div id="pm-plans-check" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--s2);border-radius:var(--r);border:1px solid var(--b1)">
        ${plansHtml || '<span style="color:var(--t3);font-size:12px">No hay planes creados</span>'}
      </div></div>

    <div class="fg full" id="pm-preview" style="display:none;background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.3);border-radius:var(--r);padding:12px">
      <div style="font-size:11px;color:var(--orange);font-weight:700;margin-bottom:6px">VISTA PREVIA</div>
      <div id="pm-preview-content" style="font-size:13px"></div>
    </div>
  </div>`;
}

async function openPromoModal(id = null) {
  _editingPromoId = id;

  // Build form HTML using the existing openModal() system
  openModal(
    id ? '✏️ Editar Promoción' : '🏷️ Nueva Promoción',
    _promoFormHTML(),
    [{ label: id ? 'Guardar Cambios' : 'Crear Promoción', fn: savePromo, cls: 'btn-p' }],
    false
  );

  // Reset fields after DOM is ready
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('pm-start-date').value = today;
  document.getElementById('pm-end-date').value   = today;
  document.getElementById('pm-start-time').value = '00:00';
  document.getElementById('pm-end-time').value   = '23:59';
  document.getElementById('pm-limit').value      = '0';
  document.getElementById('pm-preview').style.display = 'none';

  if (id) {
    const p = PROMOTIONS.find(x => x.id === id);
    if (p) {
      document.getElementById('pm-name').value       = p.name;
      document.getElementById('pm-desc').value       = p.description || '';
      document.getElementById('pm-code').value       = p.code || '';
      document.getElementById('pm-type').value       = p.discount_type;
      document.getElementById('pm-value').value      = p.discount_value;
      document.getElementById('pm-start-date').value = p.start_date;
      document.getElementById('pm-end-date').value   = p.end_date;
      document.getElementById('pm-start-time').value = p.start_time;
      document.getElementById('pm-end-time').value   = p.end_time;
      document.getElementById('pm-limit').value      = p.uses_limit;
      (p.applies_to || []).forEach(planId => {
        const cb = document.querySelector(`#pm-plans-check [data-plan-id="${planId}"]`);
        if (cb) cb.checked = true;
      });
      updatePromoPreview();
    }
  }
}

function closePromoModal() { closeModal(); _editingPromoId = null; }

function editPromo(id) { openPromoModal(id); }

async function togglePromo(id, active) {
  try {
    await PUT('/promotions/' + id, { active });
    toast(active ? 'Promoción activada' : 'Promoción pausada', 'ok');
    loadPromotions();
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

async function deletePromo(id, name) {
  if (!confirm(`¿Eliminar la promoción "${name}"?`)) return;
  try {
    await DEL('/promotions/' + id);
    toast('Promoción eliminada', 'ok');
    loadPromotions();
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

// ── Wizard integration: auto-apply promo in membership step ───
let _activeWizardPromo = null;   // promo seleccionada en el wizard

async function loadWizardPromos(planId) {
  _activeWizardPromo = null;
  const container = document.getElementById('wiz-promo-container');
  if (!container) return;

  try {
    const promos = await GET('/promotions/active?plan_id=' + planId);
    if (!promos.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div style="background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.25);border-radius:var(--r);padding:12px;margin-top:10px">
        <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:8px">🏷️ PROMOCIONES DISPONIBLES</div>
        ${promos.map(p => `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
            <input type="radio" name="wiz-promo" value="${p.id}" onchange="applyWizardPromo('${p.id}')" style="accent-color:var(--orange)">
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px">${p.name}
                <span style="color:var(--orange);margin-left:6px">${_discountLabel(p)}</span>
              </div>
              ${p.description ? `<div style="font-size:11px;color:var(--t2)">${p.description}</div>` : ''}
              ${p.code ? `<div style="font-size:11px;color:#aa55ff;font-family:monospace">Código: ${p.code}</div>` : ''}
            </div>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:var(--yellow)">${_fmtCountdown(p.seconds_left)}</span>
          </label>`).join('')}
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;font-size:13px;color:var(--t2)">
          <input type="radio" name="wiz-promo" value="" onchange="clearWizardPromo()" style="accent-color:var(--orange)"> Sin descuento
        </label>
      </div>`;
  } catch { container.innerHTML = ''; }
}

async function applyWizardPromo(promoId) {
  const planId = REG.planId;
  if (!planId) return;
  try {
    const plan = PLANS.find(p => p.id === planId);
    const promo = PROMOTIONS.find(p => p.id === promoId) ||
                  (await GET('/promotions/active?plan_id=' + planId)).find(p => p.id === promoId);
    if (!promo || !plan) return;

    // Calculate discount locally (no uses_count increment yet — that happens on confirm)
    const final   = promo.discount_type === 'percent'
      ? plan.price * (1 - promo.discount_value / 100)
      : Math.max(0, plan.price - promo.discount_value);
    const saving  = plan.price - final;

    _activeWizardPromo = { id: promoId, final_price: parseFloat(final.toFixed(2)), saving: parseFloat(saving.toFixed(2)), promo };

    const amountEl = document.getElementById('reg-amount');
    if (amountEl) amountEl.value = final.toFixed(2);

    const infoEl = document.getElementById('wiz-promo-info');
    if (infoEl) infoEl.innerHTML =
      `<span style="color:var(--green)">✓ Ahorro: ${CFG.currency}${saving.toFixed(2)}</span>`;

    toast(`Promo aplicada: ${promo.name} — ahorras ${CFG.currency}${saving.toFixed(2)}`, 'ok');
  } catch(e) { toast('Error aplicando promo: ' + e.message, 'er'); }
}

function clearWizardPromo() {
  _activeWizardPromo = null;
  const plan = PLANS.find(p => p.id === REG.planId);
  if (plan) {
    const amountEl = document.getElementById('reg-amount');
    if (amountEl) amountEl.value = plan.price;
  }
  const infoEl = document.getElementById('wiz-promo-info');
  if (infoEl) infoEl.innerHTML = '';
}

// Called when user selects a plan in the wizard step 2
function onWizPlanSelected(planId) {
  REG.planId = planId;
  const plan = PLANS.find(p => p.id === planId);
  if (plan) {
    const amountEl = document.getElementById('reg-amount');
    if (amountEl) amountEl.value = plan.price;
  }
  loadWizardPromos(planId);
}