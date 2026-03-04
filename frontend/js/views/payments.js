// ══════════════════════════════════════════════════════════════
//  PAYMENTS
// ══════════════════════════════════════════════════════════════
async function loadAndRenderPay() {
  try {
    PAYS = await GET('/payments');
    renderPayments();
  } catch(e) { toast('Error: '+e.message,'er'); }
}

function renderPayments() {
  const q = (document.getElementById('pay-q')?.value||'').toLowerCase();
  const filtered = PAYS.filter(p => !q || p.member_name.toLowerCase().includes(q) || (p.concept||'').toLowerCase().includes(q));
  const total = PAYS.reduce((s,p)=>s+p.amount,0);
  const monthStart = new Date(); monthStart.setDate(1);
  const monthTotal = PAYS.filter(p=>new Date(p.date)>=monthStart).reduce((s,p)=>s+p.amount,0);
  document.getElementById('pay-kpis').innerHTML = `
    <div class="kpi" style="--kpi-c:var(--green)"><div class="kpi-val">${CFG.currency}${total.toLocaleString()}</div><div class="kpi-lbl">Total Acumulado</div></div>
    <div class="kpi" style="--kpi-c:var(--orange)"><div class="kpi-val">${CFG.currency}${monthTotal.toLocaleString()}</div><div class="kpi-lbl">Este Mes</div></div>
    <div class="kpi" style="--kpi-c:var(--cyan)"><div class="kpi-val">${PAYS.length}</div><div class="kpi-lbl">Transacciones</div></div>
  `;
  const tbody = document.getElementById('pay-tbody');
  tbody.innerHTML = filtered.length ? filtered.map(p => `
    <tr>
      <td>${p.date}</td>
      <td><div class="td-name">${p.member_name}</div></td>
      <td>${p.concept||'—'}</td>
      <td style="font-weight:700;color:var(--green)">${CFG.currency}${p.amount}</td>
      <td>${p.method||'—'}</td>
      <td><span class="badge bg">${p.status}</span></td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--t2)">Sin pagos</td></tr>';
}

function openPayModal() {
  openModal('💰 Registrar Pago', `
    <div class="fgrid">
      <div class="fg"><label>Miembro</label><select id="pay-mem">${MEMBERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Concepto</label><input id="pay-concept" value="Membresía"></div>
      <div class="fg"><label>Monto</label><input type="number" id="pay-amt" value="0"></div>
      <div class="fg"><label>Método</label><select id="pay-met"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape</option></select></div>
      <div class="fg"><label>Fecha</label><input type="date" id="pay-date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>`, [{
      label:'Registrar', cls:'btn-primary', fn: async () => {
        await POST('/payments', { member_id:document.getElementById('pay-mem').value, concept:document.getElementById('pay-concept').value, amount:parseFloat(document.getElementById('pay-amt').value)||0, method:document.getElementById('pay-met').value, date:document.getElementById('pay-date').value, status:'pagado' });
        closeModal(); loadAndRenderPay(); toast('Pago registrado','ok');
      }
    }]);
}