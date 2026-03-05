// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

const ROLE_NAMES = {
  superadmin:  '★ Superadmin',
  admin:       '● Admin',
  recepcion:   '◎ Recepción',
  visualizador:'◌ Visualizador',
};

const ROLE_PERMS = {
  superadmin:  ['all'],
  admin:       ['dashboard','attendance','register','members','memberships','payments','announcements','reports','settings','profiles'],
  recepcion:   ['dashboard','attendance','members','memberships','payments','announcements'],
  visualizador:['dashboard','reports'],
};

function canAccess(view) {
  if (!CURRENT_USER) return false;
  const perms = ROLE_PERMS[CURRENT_USER.role] || [];
  return perms.includes('all') || perms.includes(view);
}

// Override original api() to always inject Authorization header


async function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  if (!user || !pass) return;
  const btn = document.getElementById('l-btn');
  const err = document.getElementById('l-err');
  btn.disabled = true;
  document.getElementById('l-btn-txt').textContent = 'Verificando...';
  err.style.display = 'none';
  try {
    const res = await _originalFetch(window.location.origin + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      throw new Error(e.detail || 'Credenciales incorrectas');
    }
    const data = await res.json();
    AUTH_TOKEN = data.token;
    CURRENT_USER = data.user;
    sessionStorage.setItem('gymos_token', AUTH_TOKEN);
    sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
    showApp();
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    document.getElementById('l-btn-txt').textContent = 'Iniciar Sesión';
  }
}

function togglePassVis() {
  const inp = document.getElementById('l-pass');
  const eye = document.getElementById('l-eye');
  if (inp.type === 'password') { inp.type = 'text'; eye.textContent = '🙈'; }
  else { inp.type = 'password'; eye.textContent = '👁'; }
}

function showApp() {
  // Hide login, show app shell
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('sb').classList.add('visible');
  document.getElementById('main').classList.add('visible');
  updateUserUI();
  hideForbiddenNavItems();
  boot();
}

function updateUserUI() {
  if (!CURRENT_USER) return;
  // Topbar avatar
  const av = document.getElementById('gym-av');
  if (av) {
    if (CURRENT_USER.avatar) {
      av.innerHTML = `<img src="${CURRENT_USER.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      av.textContent = (CURRENT_USER.display_name || CURRENT_USER.username)[0].toUpperCase();
    }
  }
  // User menu
  const nameEl = document.getElementById('umd-name');
  const roleEl = document.getElementById('umd-role-badge');
  if (nameEl) nameEl.textContent = CURRENT_USER.display_name || CURRENT_USER.username;
  if (roleEl) {
    roleEl.textContent = ROLE_NAMES[CURRENT_USER.role] || CURRENT_USER.role;
    roleEl.className = 'badge role-' + CURRENT_USER.role;
  }
}

function hideForbiddenNavItems() {
  document.querySelectorAll('.sb-item[data-view]').forEach(el => {
    const view = el.dataset.view;
    if (!canAccess(view)) {
      el.style.display = 'none';
    }
  });
}

function toggleUserMenu() {
  document.getElementById('user-menu-drop')?.classList.toggle('open');
}
function closeUserMenu() {
  document.getElementById('user-menu-drop')?.classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-menu-wrap')) closeUserMenu();
});

function doLogout() {
  AUTH_TOKEN = '';
  CURRENT_USER = null;
  sessionStorage.removeItem('gymos_token');
  sessionStorage.removeItem('gymos_user');
  document.getElementById('login-screen').style.display = 'flex';
  // Clear camera
  if (typeof stopCam === 'function') stopCam();
}

function openMyProfile() {
  if (!CURRENT_USER) return;
  openModal('👤 Mi Perfil', `
    <div style="text-align:center;margin-bottom:18px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--s3);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px;font-family:'Barlow Condensed',sans-serif;font-weight:900;overflow:hidden;border:2px solid var(--b2)">
        ${CURRENT_USER.avatar ? `<img src="${CURRENT_USER.avatar}" style="width:100%;height:100%;object-fit:cover">` : (CURRENT_USER.display_name||CURRENT_USER.username)[0].toUpperCase()}
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800">${CURRENT_USER.display_name}</div>
      <div style="font-size:12px;color:var(--t2)">@${CURRENT_USER.username} · ${CURRENT_USER.email||'Sin email'}</div>
      <span class="badge role-${CURRENT_USER.role}" style="margin-top:8px">${ROLE_NAMES[CURRENT_USER.role]||CURRENT_USER.role}</span>
    </div>
    <div class="fgrid">
      <div class="fg"><label>Nombre a mostrar</label><input id="mp-name" value="${CURRENT_USER.display_name||''}"></div>
      <div class="fg"><label>Email</label><input id="mp-email" value="${CURRENT_USER.email||''}"></div>
    </div>`,
    [{label:'Guardar', cls:'btn-primary', fn: async () => {
      await PUT('/admin-users/'+CURRENT_USER.id, {
        display_name: document.getElementById('mp-name').value,
        email: document.getElementById('mp-email').value,
      });
      CURRENT_USER.display_name = document.getElementById('mp-name').value;
      sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
      updateUserUI();
      closeModal(); toast('Perfil actualizado','ok');
    }}]);
}

function openChangePass() {
  openModal('🔑 Cambiar Contraseña', `
    <div class="fg" style="margin-bottom:10px"><label>Contraseña Actual</label><input type="password" id="cp-cur" placeholder="••••••••"></div>
    <div class="fg" style="margin-bottom:10px"><label>Nueva Contraseña</label><input type="password" id="cp-new" placeholder="••••••••"></div>
    <div class="fg"><label>Confirmar Nueva</label><input type="password" id="cp-con" placeholder="••••••••"></div>`,
    [{label:'Cambiar', cls:'btn-primary', fn: async () => {
      const np = document.getElementById('cp-new').value;
      const cn = document.getElementById('cp-con').value;
      if (np !== cn) { toast('Las contraseñas no coinciden','wa'); return; }
      if (np.length < 6) { toast('Mínimo 6 caracteres','wa'); return; }
      try {
        await POST('/auth/change-password', {
          current_password: document.getElementById('cp-cur').value,
          new_password: np,
        });
        closeModal(); toast('✅ Contraseña actualizada','ok');
      } catch(e) { toast('Error: '+e.message,'er'); }
    }}]);
}

// ══════════════════════════════════════════════════════════════
//  OVERRIDE NAV to check auth
// ══════════════════════════════════════════════════════════════
const _originalNav = nav;
window.nav = function(id) {
  if (!CURRENT_USER) { toast('Inicia sesión primero','wa'); return; }
  if (!canAccess(id)) { toast('Sin permisos para esta sección','wa'); return; }
  _originalNav(id);
  if (id === 'profiles') loadAndRenderProfiles();
  if (id === 'announcements') { loadAudioFiles(); }
};

// Add to VIEWS
VIEWS['profiles'] = ['Usuarios del Sistema','Gestión de perfiles y accesos'];

// ══════════════════════════════════════════════════════════════
//  BOOT OVERRIDE - Check stored session
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Try to restore session
  const storedToken = sessionStorage.getItem('gymos_token');
  const storedUser  = sessionStorage.getItem('gymos_user');
  if (storedToken && storedUser) {
    try {
      AUTH_TOKEN   = storedToken;
      CURRENT_USER = JSON.parse(storedUser);
      // Verify token is still valid
      const res = await _originalFetch(window.location.origin + '/api/auth/verify', {
        method:'POST',
        headers:{'Authorization':'Bearer '+storedToken,'Content-Type':'application/json'},
        body:'{}',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        CURRENT_USER = data.user;
        sessionStorage.setItem('gymos_user', JSON.stringify(CURRENT_USER));
        showApp();
        return;
      }
    } catch {}
    // Token invalid
    sessionStorage.removeItem('gymos_token');
    sessionStorage.removeItem('gymos_user');
  }
  // Show login
  document.getElementById('login-screen').style.display = 'flex';
});