// ══════════════════════════════════════════════════════════════
//  PROMOTIONS
// ══════════════════════════════════════════════════════════════

var _editingPromoId  = null;
var _activeWizardPromo = null;

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtCountdown(seconds) {
  if (seconds <= 0) return '00:00:00';
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = seconds % 60;
  if (d > 0) return d + 'd ' + pad2(h) + 'h ' + pad2(m) + 'm';
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}
function pad2(n) { return String(n).padStart(2,'0'); }
function discountLabel(p) {
  return p.discount_type === 'percent' ? p.discount_value + '% OFF' : CFG.currency + p.discount_value + ' OFF';
}
function promoStatusBadge(p) {
  if (!p.active) return '<span class="badge" style="background:rgba(255,255,255,.05);color:var(--t2)">Desactivada</span>';
  if (!p.now_active) {
    var start = new Date(p.start_date + 'T' + p.start_time);
    if (start > new Date()) return '<span class="badge" style="background:rgba(0,212,255,.1);color:var(--cyan)">Próximamente</span>';
    return '<span class="badge" style="background:rgba(239,71,111,.1);color:var(--red)">Expirada</span>';
  }
  return '<span class="badge" style="background:rgba(0,229,160,.15);color:var(--green)">● Activa</span>';
}
function promoCard(p) {
  var active = p.now_active;
  var border = active ? 'var(--orange)' : 'var(--b1)';
  var plans  = (p.plan_names && p.plan_names.length) ? p.plan_names.join(', ') : 'Todos los planes';
  var uses   = p.uses_limit > 0 ? (p.uses_count + ' / ' + p.uses_limit + ' usos') : (p.uses_count + ' usos');
  var topBar = active ? '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--orange),var(--yellow))"></div>' : '';
  var desc   = p.description ? '<div style="font-size:12px;color:var(--t2);margin-top:2px">' + escHtml(p.description) + '</div>' : '';
  var code   = p.code ? '<span class="badge" style="background:rgba(170,85,255,.1);color:#aa55ff;font-family:monospace">' + escHtml(p.code) + '</span>' : '';
  var cd     = active ? '<span style="font-family:monospace;font-weight:700;color:var(--yellow)" id="cd-' + p.id + '">' + fmtCountdown(p.seconds_left||0) + '</span>' : '';
  var ubar   = p.uses_limit > 0 ? '<div style="height:3px;background:var(--s3);border-radius:2px;margin-top:6px"><div style="height:100%;width:' + Math.round(p.uses_count/p.uses_limit*100) + '%;background:var(--orange);border-radius:2px"></div></div>' : '';

  var h = '<div class="panel" style="border:1px solid ' + border + ';position:relative;overflow:hidden">';
  h += topBar + '<div style="padding:14px 16px">';
  h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">';
  h += '<div style="flex:1;min-width:0"><b style="font-size:15px">' + escHtml(p.name) + '</b>' + desc + '</div>';
  h += '<div style="font-size:26px;font-weight:900;color:var(--orange);flex-shrink:0">' + discountLabel(p) + '</div></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + promoStatusBadge(p) + code + cd + '</div>';
  h += '<div style="font-size:11px;color:var(--t2);display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:8px">';
  h += '<div>Inicio: ' + p.start_date + ' ' + p.start_time + '</div>';
  h += '<div>Fin: '    + p.end_date   + ' ' + p.end_time   + '</div>';
  h += '<div>' + escHtml(plans) + '</div><div>' + uses + '</div></div>' + ubar;
  h += '<div style="display:flex;gap:8px;margin-top:12px">';
  h += '<button class="btn-s" style="flex:1" onclick="editPromo(\'' + p.id + '\')">Editar</button>';
  h += '<button class="btn-s" style="color:var(--orange)" onclick="togglePromo(\'' + p.id + '\',' + (!p.active) + ')">' + (p.active ? 'Pausar' : 'Activar') + '</button>';
  h += '<button class="btn-s" style="color:var(--red)" onclick="deletePromo(\'' + p.id + '\')">Eliminar</button>';
  h += '</div></div></div>';
  return h;
}

// ── Load ──────────────────────────────────────────────────────
async function loadPromotions() {
  Object.values(PROMO_TIMERS).forEach(clearInterval);
  PROMO_TIMERS = {};
  var grid = document.getElementById('promo-grid');
  if (grid) grid.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t2)">Cargando...</div>';
  try {
    var data = await GET('/promotions');
    PROMOTIONS = Array.isArray(data) ? data : [];
  } catch(e) {
    toast('Error: ' + e.message, 'er');
    PROMOTIONS = [];
  }
  renderPromoGrid();
  updatePromoSidebarBadge();
}

function renderPromoGrid() {
  var grid = document.getElementById('promo-grid');
  if (!grid) return;
  if (!PROMOTIONS.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">🏷️</div><div class="etxt">Sin promociones</div><div class="esub">Crea tu primera promoción</div></div>';
    return;
  }
  var sorted = PROMOTIONS.slice().sort(function(a,b){
    return (b.now_active?2:b.active?1:0)-(a.now_active?2:a.active?1:0);
  });
  grid.innerHTML = sorted.map(promoCard).join('');
  sorted.filter(function(p){ return p.now_active && p.seconds_left > 0; }).forEach(function(p) {
    var secs = p.seconds_left;
    PROMO_TIMERS[p.id] = setInterval(function() {
      secs--;
      var el = document.getElementById('cd-' + p.id);
      if (el) el.textContent = fmtCountdown(secs);
      if (secs <= 0) { clearInterval(PROMO_TIMERS[p.id]); loadPromotions(); }
    }, 1000);
  });
}

function updatePromoSidebarBadge() {
  var badge = document.getElementById('sb-promo-active');
  var n = PROMOTIONS.filter(function(p){ return p.now_active; }).length;
  if (badge) badge.style.display = n > 0 ? 'inline-block' : 'none';
}

// ── Preview ───────────────────────────────────────────────────
function updatePromoPreview() {
  var type  = (document.getElementById('pm-type')  || {}).value;
  var value = parseFloat((document.getElementById('pm-value') || {}).value || '0');
  var prev  = document.getElementById('pm-preview');
  var cont  = document.getElementById('pm-preview-content');
  if (!prev || !cont) return;
  if (!value) { prev.style.display = 'none'; return; }
  var rows = PLANS.slice(0,3).map(function(pl) {
    var final  = type === 'percent' ? pl.price*(1-value/100) : Math.max(0, pl.price-value);
    var saving = pl.price - final;
    return '<div style="margin-bottom:4px"><span style="color:var(--t2)">' + escHtml(pl.name) + ':</span> '
      + '<s style="color:var(--t3)">' + CFG.currency + pl.price + '</s> '
      + '<b style="color:var(--green)">' + CFG.currency + final.toFixed(2) + '</b> '
      + '<span style="font-size:11px;color:var(--t2)">(ahorras ' + CFG.currency + saving.toFixed(2) + ')</span></div>';
  }).join('');
  cont.innerHTML = rows || '<span style="color:var(--t3);font-size:12px">Crea planes primero</span>';
  prev.style.display = 'block';
}

// ── CRUD Modal ────────────────────────────────────────────────
function buildPromoForm() {
  var plansHtml = PLANS.map(function(pl) {
    return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:5px 10px;background:var(--s2);border-radius:6px;border:1px solid var(--b1)">'
      + '<input type="checkbox" data-plan-id="' + pl.id + '" style="accent-color:var(--orange)">'
      + ' ' + escHtml(pl.name) + '</label>';
  }).join('');

  return '<div class="fgrid">'
    + '<div class="fg full"><label>Nombre *</label><input id="pm-name" placeholder="Ej: Oferta Año Nuevo 30% OFF"></div>'
    + '<div class="fg full"><label>Descripción</label><input id="pm-desc" placeholder="Ej: Válida solo para nuevos miembros"></div>'
    + '<div class="fg"><label>Tipo</label><select id="pm-type" onchange="updatePromoPreview()"><option value="percent">Porcentaje (%)</option><option value="fixed">Monto Fijo</option></select></div>'
    + '<div class="fg"><label>Valor</label><input id="pm-value" type="number" min="0" step="0.5" placeholder="25" oninput="updatePromoPreview()"></div>'
    + '<div class="fg"><label>Fecha Inicio *</label><input id="pm-start-date" type="date"></div>'
    + '<div class="fg"><label>Fecha Fin *</label><input id="pm-end-date" type="date"></div>'
    + '<div class="fg"><label>Hora Inicio</label><input id="pm-start-time" type="time" value="00:00"></div>'
    + '<div class="fg"><label>Hora Fin</label><input id="pm-end-time" type="time" value="23:59"></div>'
    + '<div class="fg"><label>Código <small style="color:var(--t3)">(opcional)</small></label><input id="pm-code" placeholder="VERANO25" oninput="this.value=this.value.toUpperCase()"></div>'
    + '<div class="fg"><label>Límite Usos <small style="color:var(--t3)">(0=ilimitado)</small></label><input id="pm-limit" type="number" min="0" value="0"></div>'
    + '<div class="fg full"><label>Aplica a Planes <small style="color:var(--t3)">(vacío=todos)</small></label>'
    + '<div id="pm-plans-check" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--s2);border-radius:var(--r);border:1px solid var(--b1)">'
    + (plansHtml || '<span style="color:var(--t3);font-size:12px">No hay planes</span>') + '</div></div>'
    + '<div class="fg full" id="pm-preview" style="display:none;background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.3);border-radius:var(--r);padding:12px">'
    + '<div style="font-size:11px;color:var(--orange);font-weight:700;margin-bottom:6px">VISTA PREVIA</div>'
    + '<div id="pm-preview-content"></div></div>'
    + '</div>';
}

function openPromoModal(id) {
  id = id || null;
  _editingPromoId = id;
  openModal(
    id ? 'Editar Promocion' : 'Nueva Promocion',
    buildPromoForm(),
    [{ label: id ? 'Guardar' : 'Crear Promocion', fn: savePromo, cls: 'btn-p' }]
  );
  var today = new Date().toISOString().slice(0,10);
  document.getElementById('pm-start-date').value = today;
  document.getElementById('pm-end-date').value   = today;
  if (!id) return;
  var p = PROMOTIONS.find(function(x){ return x.id === id; });
  if (!p) return;
  document.getElementById('pm-name').value       = p.name       || '';
  document.getElementById('pm-desc').value       = p.description|| '';
  document.getElementById('pm-code').value       = p.code       || '';
  document.getElementById('pm-type').value       = p.discount_type || 'percent';
  document.getElementById('pm-value').value      = p.discount_value|| '';
  document.getElementById('pm-start-date').value = p.start_date || today;
  document.getElementById('pm-end-date').value   = p.end_date   || today;
  document.getElementById('pm-start-time').value = p.start_time || '00:00';
  document.getElementById('pm-end-time').value   = p.end_time   || '23:59';
  document.getElementById('pm-limit').value      = p.uses_limit || 0;
  (p.applies_to||[]).forEach(function(pid) {
    var cb = document.querySelector('#pm-plans-check [data-plan-id="' + pid + '"]');
    if (cb) cb.checked = true;
  });
  updatePromoPreview();
}

function editPromo(id) { openPromoModal(id); }

async function savePromo() {
  var name  = (document.getElementById('pm-name').value || '').trim();
  var value = parseFloat(document.getElementById('pm-value').value || '0');
  var sDate = document.getElementById('pm-start-date').value;
  var eDate = document.getElementById('pm-end-date').value;
  if (!name)            { toast('El nombre es requerido', 'wa'); return; }
  if (!value)           { toast('Ingresa el valor del descuento', 'wa'); return; }
  if (!sDate || !eDate) { toast('Las fechas son requeridas', 'wa'); return; }
  if (eDate < sDate)    { toast('La fecha fin debe ser posterior al inicio', 'wa'); return; }

  var checked = Array.from(document.querySelectorAll('#pm-plans-check input:checked'))
    .map(function(cb){ return cb.dataset.planId; });

  var payload = {
    name: name,
    description:    (document.getElementById('pm-desc').value  || '').trim(),
    code:           (document.getElementById('pm-code').value  || '').trim().toUpperCase(),
    discount_type:  document.getElementById('pm-type').value   || 'percent',
    discount_value: value,
    applies_to:     checked,
    start_date:     sDate,
    end_date:       eDate,
    start_time:     document.getElementById('pm-start-time').value || '00:00',
    end_time:       document.getElementById('pm-end-time').value   || '23:59',
    uses_limit:     parseInt(document.getElementById('pm-limit').value) || 0,
    active:         true,
  };

  try {
    if (_editingPromoId) {
      await PUT('/promotions/' + _editingPromoId, payload);
      toast('Promocion actualizada', 'ok');
    } else {
      await POST('/promotions', payload);
      toast('Promocion creada', 'ok');
    }
    closeModal();
    _editingPromoId = null;
    loadPromotions();
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

async function togglePromo(id, active) {
  try {
    await PUT('/promotions/' + id, { active: active });
    toast(active ? 'Activada' : 'Pausada', 'ok');
    loadPromotions();
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

async function deletePromo(id) {
  var p = PROMOTIONS.find(function(x){ return x.id === id; });
  if (!confirm('Eliminar "' + (p ? p.name : 'esta promocion') + '"?')) return;
  try {
    await DEL('/promotions/' + id);
    toast('Eliminada', 'ok');
    loadPromotions();
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

// ── Wizard integration ────────────────────────────────────────
async function loadWizardPromos(planId) {
  _activeWizardPromo = null;
  var container = document.getElementById('wiz-promo-container');
  var infoEl    = document.getElementById('wiz-promo-info');
  if (!container) return;
  if (infoEl) infoEl.innerHTML = '';
  try {
    var promos = await GET('/promotions/active?plan_id=' + planId);
    if (!promos || !promos.length) { container.innerHTML = ''; return; }
    var rows = promos.map(function(p) {
      return '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
        + '<input type="radio" name="wiz-promo" value="' + p.id + '" onchange="applyWizardPromo(\'' + p.id + '\')" style="accent-color:var(--orange)">'
        + '<div style="flex:1"><b>' + escHtml(p.name) + ' <span style="color:var(--orange)">' + discountLabel(p) + '</span></b>'
        + (p.code ? '<div style="font-size:11px;color:#aa55ff;font-family:monospace">Cod: ' + escHtml(p.code) + '</div>' : '')
        + '</div><span style="font-family:monospace;color:var(--yellow)">' + fmtCountdown(p.seconds_left||0) + '</span></label>';
    }).join('');
    container.innerHTML = '<div style="background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.25);border-radius:var(--r);padding:12px;margin-top:10px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:8px">PROMOCIONES DISPONIBLES</div>'
      + rows
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;font-size:13px;color:var(--t2)">'
      + '<input type="radio" name="wiz-promo" value="" onchange="clearWizardPromo()" style="accent-color:var(--orange)"> Sin descuento</label></div>';
  } catch(e) { container.innerHTML = ''; }
}

function applyWizardPromo(promoId) {
  var p    = PROMOTIONS.find(function(x){ return x.id === promoId; });
  var plan = PLANS.find(function(x){ return x.id === REG.planId; });
  if (!p || !plan) return;
  var final  = p.discount_type === 'percent' ? plan.price*(1-p.discount_value/100) : Math.max(0, plan.price-p.discount_value);
  var saving = plan.price - final;
  _activeWizardPromo = { id: promoId, final_price: parseFloat(final.toFixed(2)) };
  var amtEl  = document.getElementById('reg-amount');
  var infoEl = document.getElementById('wiz-promo-info');
  if (amtEl)  amtEl.value = final.toFixed(2);
  if (infoEl) infoEl.innerHTML = '<span style="color:var(--green);font-size:13px">Ahorro: ' + CFG.currency + saving.toFixed(2) + '</span>';
  toast('Descuento aplicado: ' + p.name, 'ok');
}

function clearWizardPromo() {
  _activeWizardPromo = null;
  var plan  = PLANS.find(function(x){ return x.id === REG.planId; });
  var amtEl = document.getElementById('reg-amount');
  if (plan && amtEl) amtEl.value = plan.price;
  var infoEl = document.getElementById('wiz-promo-info');
  if (infoEl) infoEl.innerHTML = '';
}