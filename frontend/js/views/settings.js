// ══════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════

// ── Temas de interfaz ─────────────────────────────────────────

const THEMES = ['infrared','arctic','violet','jade','slate','aurora'];

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'infrared';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gymos_theme', theme);
  // Update active card highlight (only if settings view is open)
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === theme);
  });
  toast('🎨 Tema aplicado: ' + theme, 'in');
}

function initTheme() {
  const saved = localStorage.getItem('gymos_theme') || 'infrared';
  document.documentElement.setAttribute('data-theme', saved);
}

function markActiveTheme() {
  const current = localStorage.getItem('gymos_theme') || 'infrared';
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === current);
  });
}

// ─────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s = await GET('/settings');
    CFG = {
      ...CFG,
      currency:       s.currency      || 'S/',
      gymName:        s.gymName       || 'GymOS',
      faceThreshold:  parseFloat(s.faceThreshold)  || 0.45,
      checkinCooldown:parseInt(s.checkinCooldown)  || 3600,
    };
    document.getElementById('set-name').value     = s.gymName  || '';
    document.getElementById('set-phone').value    = s.phone    || '';
    document.getElementById('set-addr').value     = s.address  || '';
    document.getElementById('set-currency').value = s.currency || 'S/';
    document.getElementById('set-tz').value       = s.timezone || '-5';
    document.getElementById('set-thresh').value   = s.faceThreshold || 0.45;
    document.getElementById('thresh-val').textContent = s.faceThreshold || 0.45;
    document.getElementById('set-cooldown').value = s.checkinCooldown || 3600;
    document.getElementById('gym-av').textContent = (s.gymName || 'G')[0].toUpperCase();
  } catch(e) { toast('Error cargando configuración: ' + e.message, 'er'); }

  // Mark current active theme card
  markActiveTheme();

  // Show danger zone only for superadmin
  const danger  = document.getElementById('panel-danger');
  if (danger) danger.style.display = CURRENT_USER?.role === 'superadmin' ? '' : 'none';

  // Export panel visible for admin+
  const expPanel = document.getElementById('panel-export');
  const canExport = ['superadmin','admin','recepcion'].includes(CURRENT_USER?.role);
  if (expPanel) expPanel.style.display = canExport ? '' : 'none';
}

async function saveSettings() {
  const data = {
    gymName:         document.getElementById('set-name').value,
    phone:           document.getElementById('set-phone').value,
    address:         document.getElementById('set-addr').value,
    currency:        document.getElementById('set-currency').value,
    timezone:        document.getElementById('set-tz').value,
    faceThreshold:   document.getElementById('set-thresh').value,
    checkinCooldown: document.getElementById('set-cooldown').value,
  };
  await PUT('/settings', data);
  CFG.currency = data.currency;
  CFG.gymName  = data.gymName;
  document.getElementById('gym-av').textContent = (data.gymName || 'G')[0].toUpperCase();
  toast('✅ Configuración guardada', 'ok');
}

// ── Exportar ──────────────────────────────────────────────────

function downloadCSV(endpoint, defaultFilename) {
  const token = AUTH_TOKEN || sessionStorage.getItem('gymos_token') || '';
  if (!token) { toast('❌ Sesión no iniciada', 'er'); return; }
  const url = API + endpoint + '?token=' + encodeURIComponent(token);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('📥 Descargando...', 'in');
}

function exportMembers() {
  downloadCSV('/tools/export-members', 'miembros.csv');
}

function exportReport() {
  downloadCSV('/tools/export-report', 'reporte_gymos.csv');
}

function exportDB() {
  window.open(window.location.origin + '/api/export', '_blank');
}

function importDB() {
  document.getElementById('import-file').click();
}

async function doImport(input) {
  const file = input.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      await POST('/import', JSON.parse(e.target.result));
      toast('Datos importados ✓', 'ok');
    } catch(e2) { toast('Error importando: ' + e2.message, 'er'); }
  };
  r.readAsText(file);
}

// ── Limpiar datos (superadmin) ────────────────────────────────

const CLEAR_LABELS = {
  attendance:  { label: 'asistencia',             warn: '¿Eliminar TODOS los registros de asistencia?\n\nEsta acción es irreversible.' },
  payments:    { label: 'pagos',                   warn: '¿Eliminar TODO el historial de pagos?\n\nEsta acción es irreversible.' },
  memberships: { label: 'membresías',              warn: '¿Eliminar TODAS las membresías?\n\nEsta acción es irreversible.' },
  all:         { label: 'base de datos completa',  warn: '⚠️ RESETEAR BASE DE DATOS COMPLETA\n\nEsto eliminará:\n• Todos los miembros\n• Toda la asistencia\n• Todos los pagos\n• Todas las membresías\n\nSe mantendrán: usuarios admin y planes.\n\nEscribe RESET para confirmar:' },
};

async function clearData(type) {
  const cfg = CLEAR_LABELS[type];
  if (!cfg) return;

  if (type === 'all') {
    const input = prompt(cfg.warn);
    if (input !== 'RESET') {
      toast('Cancelado — debes escribir RESET exactamente', 'wa');
      return;
    }
  } else {
    if (!confirm(cfg.warn)) return;
  }

  const endpoint = '/tools/clear-' + (type === 'all' ? 'all' : type);
  try {
    const result = await api(endpoint, { method: 'POST' });
    const count  = type === 'all'
      ? Object.values(result.cleared || {}).reduce((a, b) => a + b, 0)
      : (result.deleted || 0);
    toast('✓ ' + count + ' registros de ' + cfg.label + ' eliminados', 'ok');
    // Refresh local caches
    if (type === 'all' || type === 'attendance') { /* attendance view will reload */ }
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}