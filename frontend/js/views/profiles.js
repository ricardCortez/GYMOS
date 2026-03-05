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