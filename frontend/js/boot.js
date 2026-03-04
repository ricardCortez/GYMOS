// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
async function boot() {
  setInterval(tick, 1000); tick();

  const ok = await pingServer();
  if (ok) {
    try {
      const cfg = await GET('/settings');
      CFG.currency = cfg.currency||'S/';
      CFG.gymName  = cfg.gymName||'GymOS';
      CFG.faceThreshold = parseFloat(cfg.faceThreshold)||0.45;
      CFG.checkinCooldown = parseInt(cfg.checkinCooldown)||3600;
      document.getElementById('gym-av').textContent = (cfg.gymName||'G')[0].toUpperCase();

      PLANS   = await GET('/plans');
      MEMBERS = await GET('/members');
      ANNS    = await GET('/announcements');

      await checkFaceStatus();
      renderDashboard();
      toast('✅ GymOS conectado al servidor','ok');
    } catch(e) { toast('Error inicial: '+e.message,'er'); }
  } else {
    toast('⚠ Servidor no disponible en localhost:8000','wa', 6000);
    document.getElementById('face-pill').className='tb-pill err';
    document.getElementById('face-pill').textContent='✕ Sin servidor';
  }

  // Periodic ping
  setInterval(async () => {
    await pingServer();
    checkFaceStatus();
  }, 30000);
}

// boot() is now called after auth (see above)