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