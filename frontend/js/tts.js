// ══════════════════════════════════════════════════════════════
//  IMPROVED TTS
// ══════════════════════════════════════════════════════════════
const QUICK_MSGS = {
  '🚪 Cierre en 30 min': 'Estimados miembros, les informamos que el gimnasio cerrará sus puertas en 30 minutos. Les pedimos que vayan concluyendo su entrenamiento. Gracias por su comprensión.',
  '🌅 Buenos días':      'Buenos días a todos nuestros miembros. Bienvenidos al gimnasio. Que tengan una excelente sesión de entrenamiento el día de hoy.',
  '🌙 Buenas noches':    'Buenas noches estimados miembros. Gracias por visitarnos hoy. Los esperamos mañana. ¡Que descansen bien!',
  '🧹 Limpieza en curso':'Estimados miembros, en este momento se está realizando limpieza en el área de pesas. Por favor, tengan cuidado al transitar por esa zona. Gracias.',
  '🏋 Hora pico':        'Atención miembros, actualmente nos encontramos en hora de alta concurrencia. Les pedimos amablemente compartir los equipos y respetar los turnos. Muchas gracias.',
};

function setQuickMsg(el) {
  document.querySelectorAll('.tts-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const msg = QUICK_MSGS[el.textContent] || el.textContent;
  document.getElementById('ann-instant').value = msg;
}

// Override original speak() for better quality
function speak(text, opts={}) {
  // Check if it's an audio file reference
  if (text && text.startsWith('__audio__')) {
    const audioId = text.replace('__audio__','');
    const af = AUDIO_FILES.find(f=>f.id===audioId);
    if (af) { playAudioFile(af.id, af.url, af.name); return; }
  }
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = 'es-PE';
  const sel = document.getElementById('ann-voice');
  if (sel && voices.length) u.voice = voices[parseInt(sel.value)||0];
  const rateEl  = document.getElementById('ann-rate');
  const pitchEl = document.getElementById('ann-pitch');
  const volEl   = document.getElementById('ann-vol');
  u.rate   = rateEl  ? parseFloat(rateEl.value)  : 0.9;
  u.pitch  = pitchEl ? parseFloat(pitchEl.value) : 1.0;
  u.volume = volEl   ? parseFloat(volEl.value)   : 1.0;
  synth.speak(u);
}