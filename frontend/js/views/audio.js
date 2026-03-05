// ══════════════════════════════════════════════════════════════
//  AUDIO FILES
// ══════════════════════════════════════════════════════════════
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