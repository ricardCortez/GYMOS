// ══════════════════════════════════════════════════════════════
//  CAMERA SYSTEM (rewritten for Windows compatibility)
// ══════════════════════════════════════════════════════════════

let faceLoopTimer = null;
var recognizing   = false;  // declared explicitly to avoid strict-mode ReferenceError

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
  if (!videoEl) return Promise.resolve();  // guard: view may not be in DOM
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

  const vidEl = document.getElementById('cam-vid');
  if (!vidEl) {
    toast('Error: vista de cámara no cargada. Recarga la página.', 'er');
    return;
  }

  const btn        = document.getElementById('cam-btn');
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
        if (typeof speakWelcome === 'function') {
          speakWelcome(firstName, null, daysLeft);
        }
      }
      if (typeof renderTodayLog === 'function') renderTodayLog();
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

// override closeModal to also stop QF cam — deferred until all scripts loaded
window.addEventListener('load', function() {
  const _baseCloseModal = closeModal;
  window.closeModal = function() {
    stopQFCam();
    _baseCloseModal();
  };
});

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