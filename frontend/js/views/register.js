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