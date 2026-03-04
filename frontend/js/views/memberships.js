// ══════════════════════════════════════════════════════════════
//  MEMBERSHIPS
// ══════════════════════════════════════════════════════════════
async function loadAndRenderMs() {
  try {
    const [ms, plans] = await Promise.all([GET('/memberships'), GET('/plans')]);
    MS_LIST = ms; PLANS = plans;
    renderPlanGrid();
    renderMemberships();
  } catch(e) { toast('Error: '+e.message,'er'); }
}

function msTab(tab, el) {
  ['plans','active','expired'].forEach(t => document.getElementById('ms-'+t).style.display = t===tab?'block':'none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (tab === 'active') renderMemberships();
  if (tab === 'expired') renderMemberships(true);
}

function renderPlanGrid() {
  document.getElementById('plan-grid').innerHTML = PLANS.map(p => `
    <div class="pc ${p.featured?'feat':''}">
      ${p.featured?'<div class="pc-badge">POPULAR</div>':''}
      <div class="pc-acts">
        <button class="btn btn-icon btn-ghost" onclick="openPlanModal('${p.id}')">✏</button>
        <button class="btn btn-icon btn-danger" onclick="deletePlan('${p.id}')">✕</button>
      </div>
      <div class="pc-icon">${p.icon}</div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-price">${CFG.currency}${p.price}</div>
      <div class="pc-dur">${p.duration===30?'por mes':p.duration===365?'por año':p.duration+' días'}</div>
      <div class="pc-feats">${(p.features||[]).map(f=>`<div class="pc-feat">${f}</div>`).join('')}</div>
    </div>`).join('');
}

function renderMemberships(showExpired=false) {
  const q   = (document.getElementById('ms-q')?.value||'').toLowerCase();
  const now = new Date();
  const all = MS_LIST.filter(ms => showExpired ? ms.days_left < 0 : ms.days_left >= 0);
  const filtered = all.filter(ms => !q || ms.member_name.toLowerCase().includes(q));

  const tbody = document.getElementById(showExpired ? 'ms-exp-tbody' : 'ms-tbody');
  if (!tbody) return;
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--t2)">Sin registros</td></tr>`; return; }

  tbody.innerHTML = filtered.map(ms => {
    const pct = Math.min(100, Math.max(0, (1 - ms.days_left/(PLANS.find(p=>p.id===ms.plan_id)?.duration||30))*100));
    if (showExpired) return `
      <tr>
        <td><div class="td-name">${ms.member_name}</div></td>
        <td>${ms.plan_name}</td>
        <td style="color:var(--red)">${ms.end_date}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button></td>
      </tr>`;
    return `
      <tr>
        <td><div class="td-name">${ms.member_name}</div></td>
        <td><span class="badge bgr">${ms.plan_name}</span></td>
        <td>${ms.start_date}</td>
        <td>
          <div>${ms.end_date}</div>
          <div class="prog" style="width:100px;margin-top:4px"><div class="prog-fill" style="width:${pct}%;background:${ms.days_left<=7?'var(--red)':ms.days_left<=14?'var(--yellow)':'var(--green)'}"></div></div>
        </td>
        <td><span class="badge ${ms.days_left<=7?'br':ms.days_left<=14?'by':'bg'}">${ms.days_left}d</span></td>
        <td><button class="btn btn-ghost btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button></td>
      </tr>`;
  }).join('');
}

function openPlanModal(id=null) {
  const p = id ? PLANS.find(x=>x.id===id) : null;
  openModal(id?'✏ Editar Plan':'✚ Nuevo Plan', `
    <div class="fgrid">
      <div class="fg"><label>Nombre</label><input id="pm-name" value="${p?.name||''}"></div>
      <div class="fg"><label>Ícono</label><input id="pm-icon" value="${p?.icon||'💪'}" style="font-size:18px"></div>
      <div class="fg"><label>Precio (${CFG.currency})</label><input id="pm-price" type="number" value="${p?.price||0}"></div>
      <div class="fg"><label>Duración (días)</label><input id="pm-dur" type="number" value="${p?.duration||30}"></div>
      <div class="fg full"><label>Beneficios (uno por línea)</label><textarea id="pm-feats">${(p?.features||[]).join('\n')}</textarea></div>
      <div class="fg"><label>¿Plan destacado?</label><select id="pm-feat"><option value="0">No</option><option value="1" ${p?.featured?'selected':''}>Sí</option></select></div>
    </div>`, [{
      label:'Guardar Plan', cls:'btn-primary', fn: async () => {
        const data = { name:document.getElementById('pm-name').value, icon:document.getElementById('pm-icon').value, price:parseFloat(document.getElementById('pm-price').value)||0, duration:parseInt(document.getElementById('pm-dur').value)||30, features:document.getElementById('pm-feats').value.split('\n').filter(Boolean), featured:document.getElementById('pm-feat').value==='1' };
        if (id) await PUT('/plans/'+id, data); else await POST('/plans', data);
        closeModal(); loadAndRenderMs(); toast('Plan guardado','ok');
      }
    }]);
}

async function deletePlan(id) {
  if (!confirm('¿Eliminar este plan?')) return;
  await DEL('/plans/'+id); loadAndRenderMs(); toast('Plan eliminado','in');
}

function openRenewModal(msId) {
  const ms = MS_LIST.find(x=>x.id===msId);
  openModal('🔄 Renovar Membresía', `
    <div style="background:var(--s2);padding:12px;border-radius:var(--r);margin-bottom:14px;font-size:13px">
      <strong>${ms?.member_name}</strong> — Plan: ${ms?.plan_name}
    </div>
    <div class="fgrid">
      <div class="fg"><label>Nuevo Plan</label><select id="rn-plan">${PLANS.map(p=>`<option value="${p.id}" ${p.id===ms?.plan_id?'selected':''}>${p.name} — ${CFG.currency}${p.price}</option>`).join('')}</select></div>
      <div class="fg"><label>Inicio</label><input type="date" id="rn-start" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label>Método de Pago</label><select id="rn-method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option><option>Plin</option></select></div>
      <div class="fg"><label>Monto</label><input type="number" id="rn-amount" value="${ms?.amount||0}"></div>
    </div>`, [{
      label:'Renovar y Cobrar', cls:'btn-success', fn: async () => {
        await PUT('/memberships/'+msId+'/renew', { plan_id:document.getElementById('rn-plan').value, start_date:document.getElementById('rn-start').value, payment_method:document.getElementById('rn-method').value, amount:parseFloat(document.getElementById('rn-amount').value)||0 });
        closeModal(); loadAndRenderMs(); toast('✅ Membresía renovada','ok');
      }
    }]);
}

function openAssignMs() {
  openModal('✚ Asignar Membresía', `
    <div class="fgrid">
      <div class="fg"><label>Miembro</label><select id="as-mem">${MEMBERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Plan</label><select id="as-plan">${PLANS.map(p=>`<option value="${p.id}">${p.name} — ${CFG.currency}${p.price}</option>`).join('')}</select></div>
      <div class="fg"><label>Inicio</label><input type="date" id="as-start" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label>Método Pago</label><select id="as-method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option></select></div>
    </div>`, [{
      label:'Asignar', cls:'btn-primary', fn: async () => {
        await POST('/memberships', { member_id:document.getElementById('as-mem').value, plan_id:document.getElementById('as-plan').value, start_date:document.getElementById('as-start').value, payment_method:document.getElementById('as-method').value });
        closeModal(); loadAndRenderMs(); toast('Membresía asignada','ok');
      }
    }]);
}