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