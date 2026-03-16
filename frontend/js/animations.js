/* ═══════════════════════════════════════════════════════
   GymOS — animations.js
   Skeleton loaders · KPI counters · Micro-interactions
═══════════════════════════════════════════════════════ */

/* ── Skeleton Loader ─────────────────────────────────── */

/**
 * Replace an element's content with skeleton placeholders.
 * @param {string|Element} target  CSS selector or DOM element
 * @param {number} rows            Number of skeleton rows to show
 * @param {string} [type]          'table' | 'card' | 'text' (default: 'text')
 */
function showSkeleton(target, rows = 4, type = 'text') {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  el.dataset.skeletonPrev = el.innerHTML;

  if (type === 'table') {
    const cols = 4;
    let html = '<table class="tbl"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += `<td><div class="skeleton" style="height:14px;width:${60 + Math.random()*30|0}%;border-radius:4px"></div></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  } else if (type === 'card') {
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">';
    for (let r = 0; r < rows; r++) {
      html += `<div class="panel" style="padding:20px">
        <div class="skeleton" style="height:12px;width:40%;border-radius:4px;margin-bottom:12px"></div>
        <div class="skeleton" style="height:32px;width:60%;border-radius:6px;margin-bottom:8px"></div>
        <div class="skeleton" style="height:10px;width:70%;border-radius:4px"></div>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } else {
    let html = '';
    for (let r = 0; r < rows; r++) {
      const w = 55 + Math.random() * 40 | 0;
      html += `<div class="skeleton" style="height:14px;width:${w}%;border-radius:4px;margin-bottom:10px"></div>`;
    }
    el.innerHTML = html;
  }
}

/**
 * Restore the element's content that was replaced by showSkeleton.
 * @param {string|Element} target
 * @param {string} [newContent]  If provided, replaces skeleton with this HTML instead of original
 */
function hideSkeleton(target, newContent) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  if (newContent !== undefined) {
    el.innerHTML = newContent;
  } else if (el.dataset.skeletonPrev !== undefined) {
    el.innerHTML = el.dataset.skeletonPrev;
  }
  delete el.dataset.skeletonPrev;
}

/* ── KPI Number Counter ──────────────────────────────── */

/**
 * Animate a numeric value from 0 (or current displayed value) to target.
 * @param {string|Element} target  CSS selector or DOM element
 * @param {number} end             Target number
 * @param {object} [opts]
 *   opts.duration  ms (default 900)
 *   opts.prefix    string prepended to number (e.g. '$')
 *   opts.suffix    string appended (e.g. '%')
 *   opts.decimals  decimal places (default 0)
 *   opts.easing    'ease-out' | 'linear' (default 'ease-out')
 */
function animateCounter(target, end, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;

  const duration = opts.duration ?? 900;
  const prefix   = opts.prefix  ?? '';
  const suffix   = opts.suffix  ?? '';
  const decimals = opts.decimals ?? 0;

  const startText = el.textContent.replace(/[^0-9.-]/g, '');
  const start = parseFloat(startText) || 0;
  const startTime = performance.now();

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOut(progress);
    const current = start + (end - start) * eased;
    el.textContent = prefix + current.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/**
 * Animate all elements matching selector that have data-count attribute.
 * Usage: <span class="kpi-val" data-count="142">0</span>
 */
function animateAllCounters(selector = '[data-count]', opts = {}) {
  document.querySelectorAll(selector).forEach(el => {
    const end = parseFloat(el.dataset.count);
    if (!isNaN(end)) animateCounter(el, end, opts);
  });
}

/* ── View Transition ─────────────────────────────────── */

/**
 * Fade-in the main content area after a view loads.
 * Called automatically by ui.js loadView — or manually.
 */
function fadeInContent(containerSelector = '#content') {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(6px)';
  el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  });
}

/* ── Ripple Effect ───────────────────────────────────── */

/**
 * Attach a CSS ripple effect to buttons / interactive elements.
 * Call once on DOMContentLoaded or after dynamic content insertion.
 * @param {string} selector
 */
function attachRipple(selector = '.btn, .sb-item, .mc') {
  document.querySelectorAll(selector).forEach(el => {
    if (el.dataset.ripple) return; // already attached
    el.dataset.ripple = '1';
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.addEventListener('click', function(e) {
      const r = document.createElement('span');
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      r.style.cssText = `
        position:absolute;border-radius:50%;pointer-events:none;
        width:${size}px;height:${size}px;
        left:${e.clientX - rect.left - size/2}px;
        top:${e.clientY - rect.top - size/2}px;
        background:rgba(255,255,255,0.12);
        transform:scale(0);animation:rippleAnim 0.5s ease-out forwards;
      `;
      el.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    });
  });
}

/* ── Toast Utility (enhanced) ────────────────────────── */

/**
 * Show a styled toast notification.
 * Wraps the existing showToast if present, otherwise standalone.
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} [type]
 * @param {number} [duration] ms
 */
function toast(message, type = 'info', duration = 3500) {
  if (typeof showToast === 'function') {
    showToast(message, type, duration);
    return;
  }
  const container = document.getElementById('toast');
  if (!container) return;
  const t = document.createElement('div');
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'i' };
  t.className = `toast-item toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] ?? 'i'}</span><span>${message}</span>`;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove());
  }, duration);
}

/* ── Intersection Observer — lazy animate ────────────── */

/**
 * Animate elements into view when they enter the viewport.
 * Add class 'anim-on-scroll' to any element to trigger.
 */
(function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('anim-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  function observe() {
    document.querySelectorAll('.anim-on-scroll:not(.anim-visible)').forEach(el => obs.observe(el));
  }

  // Observe existing elements and re-run after view loads
  document.addEventListener('DOMContentLoaded', observe);
  // Also expose so ui.js can call after dynamic view load
  window.observeScrollAnimations = observe;
})();

/* ── CSS keyframe injection ──────────────────────────── */
(function injectKeyframes() {
  if (document.getElementById('anim-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'anim-keyframes';
  style.textContent = `
    @keyframes rippleAnim {
      to { transform: scale(2.5); opacity: 0; }
    }
    .anim-on-scroll {
      opacity: 0;
      transform: translateY(16px);
      transition: opacity 0.4s ease, transform 0.4s ease;
    }
    .anim-on-scroll.anim-visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
})();

/* ── Init on load ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  attachRipple();
});
