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