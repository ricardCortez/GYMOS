// ══════════════════════════════════════════════════════════════
//  PROFILES / ADMIN USERS
// ══════════════════════════════════════════════════════════════
let ADMIN_USERS = [];

const ROLE_COLORS = {
  superadmin: '#ff6b00',
  admin:      '#00d4ff',
  recepcion:  '#00e5a0',
  visualizador:'#8890c0',
};

// ── Load & render ─────────────────────────────────────────────
async function loadAndRenderProfiles() {
  try {
    var raw = await GET('/admin-users');
    // Filter out IDs that were permanently deleted this session
    var bl = JSON.parse(sessionStorage.getItem('deleted_users') || '[]');
    ADMIN_USERS = raw.filter(u => !bl.includes(u.id));
    renderProfiles();
  } catch(e) {
    const grid = document.getElementById('profile-grid');
    if (!grid) return;
    if (e.message?.includes('403') || e.message?.includes('401')) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">🔒</div><div class="etxt">Sin permisos para ver usuarios</div></div>';
    } else {
      toast('Error cargando usuarios: ' + e.message, 'er');
    }
  }
}

function renderProfiles() {
  const grid = document.getElementById('profile-grid');
  if (!grid) return;

  const isSuperAdmin = CURRENT_USER?.role === 'superadmin';
  const isAdmin      = isSuperAdmin || CURRENT_USER?.role === 'admin';

  if (!ADMIN_USERS.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="eico">👤</div><div class="etxt">Sin usuarios</div></div>';
    return;
  }

  // Sort: active first, then inactive
  const sorted = ADMIN_USERS.slice().sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));

  grid.innerHTML = sorted.map(u => profileCard(u, isSuperAdmin, isAdmin)).join('');

  // Hide add button if not admin
  const btn = document.getElementById('add-profile-btn');
  if (btn) btn.style.display = isAdmin ? '' : 'none';
}

function profileCard(u, isSuperAdmin, isAdmin) {
  const roleColor = ROLE_COLORS[u.role] || '#8890c0';
  const isSelf    = CURRENT_USER && u.id === CURRENT_USER.id;
  const inactive  = !u.active;

  var av = u.avatar
    ? '<img src="' + u.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
    : '<span style="color:' + roleColor + ';font-size:28px;font-weight:900">' + (u.display_name || u.username)[0].toUpperCase() + '</span>';

  var statusBadge = inactive
    ? '<span class="badge" style="background:rgba(255,45,85,.12);color:var(--red);border:1px solid rgba(255,45,85,.3)">⏸ Inactivo</span>'
    : '<span class="badge" style="background:rgba(0,229,160,.1);color:var(--green)">● Activo</span>';

  var roleBadge = '<span class="badge" style="background:' + roleColor + '18;color:' + roleColor + ';border:1px solid ' + roleColor + '30">'
    + (ROLE_NAMES[u.role] || u.role) + '</span>';

  var lastLogin = u.last_login
    ? '<div style="font-size:11px;color:var(--t3);margin-top:8px">Último acceso: ' + new Date(u.last_login).toLocaleDateString('es') + '</div>'
    : '<div style="font-size:11px;color:var(--t3);margin-top:8px">Sin accesos registrados</div>';

  // Action buttons — only for admins, not on self for destructive actions
  var actions = '';
  if (isAdmin) {
    var editBtn   = '<button class="btn-s" style="flex:1" onclick="editProfile(\'' + u.id + '\')">✏ Editar</button>';
    var toggleBtn = '';
    var delBtn    = '';

    if (isSuperAdmin && !isSelf) {
      if (inactive) {
        // Show reactivate (green)
        toggleBtn = '<button class="btn-s" style="color:var(--green);border-color:var(--green)20" '
          + 'onclick="toggleProfile(\'' + u.id + '\', true)" title="Reactivar usuario">▶ Activar</button>';
      } else {
        // Show deactivate (orange)
        toggleBtn = '<button class="btn-s" style="color:var(--orange)" '
          + 'onclick="toggleProfile(\'' + u.id + '\', false)" title="Desactivar sin eliminar">⏸ Pausar</button>';
      }
      // Permanent delete (red) — always visible for superadmin on other users
      delBtn = '<button class="btn-s" style="color:var(--red)" '
        + 'onclick="deleteProfile(\'' + u.id + '\')" title="Eliminar permanentemente">🗑</button>';
    }

    actions = '<div style="display:flex;gap:6px;margin-top:12px">' + editBtn + toggleBtn + delBtn + '</div>';
  }

  // Card opacity if inactive
  var cardStyle = inactive
    ? 'opacity:.65;border-style:dashed'
    : '';

  return '<div class="pcard" style="' + cardStyle + '">'
    + '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + (inactive ? 'var(--b2)' : roleColor) + ';border-radius:var(--r2) var(--r2) 0 0"></div>'
    + '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:8px">'
    +   '<div class="pcard-av" style="border-color:' + roleColor + '30;background:' + roleColor + '12">' + av + '</div>'
    +   '<div>'
    +     '<div class="pcard-name" style="text-align:center">' + (u.display_name || u.username)
    +       (isSelf ? ' <span style="font-size:11px;color:var(--orange)">(Tú)</span>' : '') + '</div>'
    +     '<div class="pcard-user" style="text-align:center">@' + u.username + '</div>'
    +   '</div>'
    +   '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">' + roleBadge + statusBadge + '</div>'
    + '</div>'
    + lastLogin
    + actions
    + '</div>';
}

// ── Create / Edit modal ───────────────────────────────────────
function openProfileModal(id) {
  id = id || null;
  const u           = id ? ADMIN_USERS.find(x => x.id === id) : null;
  const isSuperAdmin = CURRENT_USER?.role === 'superadmin';

  var roleSelect = isSuperAdmin
    ? '<div class="fg"><label>Rol</label><select id="pu-role">'
        + '<option value="superadmin"' + (u?.role === 'superadmin' ? ' selected' : '') + '>★ Superadmin — acceso total</option>'
        + '<option value="admin"'      + (u?.role === 'admin'      ? ' selected' : '') + '>● Admin — gestión completa</option>'
        + '<option value="recepcion"'  + (!u || u.role === 'recepcion' ? ' selected' : '') + '>◎ Recepción — check-in y miembros</option>'
        + '<option value="visualizador"' + (u?.role === 'visualizador' ? ' selected' : '') + '>◌ Visualizador — solo lectura</option>'
        + '</select></div>'
    : '<input type="hidden" id="pu-role" value="' + (u?.role || 'recepcion') + '">';

  var activeSelect = '<div class="fg"><label>Estado</label><select id="pu-active">'
    + '<option value="true"' + (u?.active !== false ? ' selected' : '') + '>✅ Activo</option>'
    + '<option value="false"' + (u?.active === false ? ' selected' : '') + '>⏸ Inactivo</option>'
    + '</select></div>';

  var body = '<div class="fgrid">'
    + '<div class="fg"><label>Nombre a Mostrar *</label><input id="pu-name" value="' + (u?.display_name || '') + '" placeholder="Ej: Juan García"></div>'
    + '<div class="fg"><label>Usuario (login) *</label><input id="pu-user" value="' + (u?.username || '') + '"'
      + (id ? ' readonly style="opacity:.6"' : '') + ' placeholder="Ej: jgarcia"></div>'
    + '<div class="fg"><label>Email</label><input id="pu-email" type="email" value="' + (u?.email || '') + '" placeholder="correo@gym.com"></div>'
    + '<div class="fg"><label>Contraseña ' + (id ? '(vacío = no cambiar)' : '*') + '</label>'
      + '<input type="password" id="pu-pass" placeholder="' + (id ? 'Nueva contraseña...' : 'Mínimo 6 caracteres') + '"></div>'
    + roleSelect
    + (isSuperAdmin ? activeSelect : '')
    + '</div>'
    + '<div style="margin-top:12px;padding:10px 12px;background:var(--s2);border-radius:var(--r);font-size:12px;color:var(--t2);border:1px solid var(--b1)">'
    + '<b style="color:var(--text)">Permisos por rol:</b><br>'
    + '★ Superadmin: Todo + gestión de usuarios · '
    + '● Admin: Operaciones + configuración · '
    + '◎ Recepción: Check-in, miembros, pagos · '
    + '◌ Visualizador: Solo ver dashboard y reportes</div>';

  openModal(
    id ? '✏️ Editar Usuario' : '✚ Nuevo Usuario',
    body,
    [{ label: id ? 'Guardar Cambios' : 'Crear Usuario', cls: 'btn-p', fn: () => saveProfile(id) }]
  );
}

async function saveProfile(id) {
  const name = (document.getElementById('pu-name').value || '').trim();
  const user = (document.getElementById('pu-user').value || '').trim();
  const pass = (document.getElementById('pu-pass').value || '');

  if (!name || !user) { toast('Nombre y usuario son requeridos', 'wa'); return; }
  if (!id && pass.length < 6) { toast('Contraseña mínimo 6 caracteres', 'wa'); return; }

  const payload = {
    display_name: name,
    username:     user,
    email:        (document.getElementById('pu-email').value || '').trim(),
    role:         document.getElementById('pu-role').value,
    active:       (document.getElementById('pu-active')?.value || 'true') === 'true',
  };
  if (pass) payload.password = pass;

  try {
    if (id) await PUT('/admin-users/' + id, payload);
    else    await POST('/admin-users', payload);
    closeModal();
    if (typeof VIEW_CACHE !== 'undefined') delete VIEW_CACHE['profiles'];
    await loadAndRenderProfiles();
    toast(id ? 'Usuario actualizado ✓' : 'Usuario creado ✓', 'ok');
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

function editProfile(id) { openProfileModal(id); }

// ── Toggle active/inactive ────────────────────────────────────
async function toggleProfile(id, activate) {
  const u = ADMIN_USERS.find(x => x.id === id);
  if (!u) return;
  if (!confirm('¿' + (activate ? 'Reactivar' : 'Desactivar') + ' a "' + (u.display_name || u.username) + '"?')) return;
  try {
    // Use api() helper which adds /api prefix and auth header
    await PUT('/admin-users/' + id, { active: activate });
    // Update local array immediately — no waiting for re-fetch
    u.active = activate;
    if (typeof VIEW_CACHE !== 'undefined') delete VIEW_CACHE['profiles'];
    renderProfiles();
    toast((activate ? 'Usuario activado' : 'Usuario desactivado') + ' ✓', 'ok');
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}

// ── Permanent delete ──────────────────────────────────────────
async function deleteProfile(id) {
  const u = ADMIN_USERS.find(x => x.id === id);
  if (!u) return;
  if (!confirm('⚠️ Eliminar PERMANENTEMENTE a "' + (u.display_name || u.username) + '"?\n\nEsta acción no se puede deshacer.')) return;
  try {
    await DEL('/admin-users/' + id);
    // Save to sessionStorage blacklist so refresh doesn't bring it back
    var bl = JSON.parse(sessionStorage.getItem('deleted_users') || '[]');
    bl.push(id);
    sessionStorage.setItem('deleted_users', JSON.stringify(bl));
    // Remove from local array immediately
    ADMIN_USERS = ADMIN_USERS.filter(x => x.id !== id);
    if (typeof VIEW_CACHE !== 'undefined') delete VIEW_CACHE['profiles'];
    renderProfiles();
    toast('Usuario eliminado ✓', 'ok');
  } catch(e) { toast('Error: ' + e.message, 'er'); }
}