/* Skywatch app promo card — behaviour.
   Copy lives in index.html (<template id="copy"> and data-* attributes); this file only moves state around. */
(() => {
  'use strict';

  const doc = document;
  const lang = doc.documentElement.lang || 'en';
  const $ = (sel, scope = doc) => scope.querySelector(sel);
  const $$ = (sel, scope = doc) => Array.from(scope.querySelectorAll(sel));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const copyMap = new Map();
  const template = $('#copy');
  if (template) for (const el of template.content.querySelectorAll('[data-copy]')) copyMap.set(el.dataset.copy, el.textContent.trim());
  const copy = (key, vars = {}) => (copyMap.get(key) || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));

  const live = $('#live');
  const announce = (text) => {
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  };

  /* ------------------------------------------------------------------ QR code
     Byte mode, error-correction level L, versions 1-5 (up to 106 bytes), one Reed-Solomon block.
     Returns the module matrix; the SVG path is built from it. */
  const QR = (() => {
    const CODEWORDS = [null, [26, 7], [44, 10], [70, 15], [100, 20], [134, 26]]; // [total, error correction]
    const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30]];
    const MASKS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];

    // GF(256) with the QR primitive polynomial 0x11D.
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

    function reedSolomon(data, ecLength) {
      let gen = [1];
      for (let i = 0; i < ecLength; i++) {
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
          next[j] ^= gen[j];
          next[j + 1] ^= mul(gen[j], EXP[i]);
        }
        gen = next;
      }
      const rem = new Array(ecLength).fill(0);
      for (const byte of data) {
        const factor = byte ^ rem.shift();
        rem.push(0);
        for (let j = 0; j < ecLength; j++) rem[j] ^= mul(gen[j + 1], factor);
      }
      return rem;
    }

    function codewords(bytes, version) {
      const [total, ec] = CODEWORDS[version];
      const capacity = total - ec;
      const bits = [];
      const push = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1); };
      push(4, 4);
      push(bytes.length, 8);
      for (const b of bytes) push(b, 8);
      push(0, Math.min(4, capacity * 8 - bits.length));
      while (bits.length % 8) bits.push(0);
      const data = [];
      for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
      for (let pad = 0xec; data.length < capacity; pad ^= 0xfd) data.push(pad);
      return data.concat(reedSolomon(data, ec));
    }

    function encode(text) {
      const bytes = Array.from(new TextEncoder().encode(text));
      let version = 1;
      while (version < CODEWORDS.length && CODEWORDS[version][0] - CODEWORDS[version][1] - 2 < bytes.length) version++;
      if (version >= CODEWORDS.length) return null;
      const size = version * 4 + 17;
      const mod = new Uint8Array(size * size);
      const fixed = new Uint8Array(size * size);
      const set = (x, y, dark) => { mod[y * size + x] = dark ? 1 : 0; fixed[y * size + x] = 1; };

      const finder = (cx, cy) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx; const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, d !== 2 && d !== 4);
        }
      };
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
      const centers = ALIGN[version];
      for (const cy of centers) for (const cx of centers) {
        if (fixed[cy * size + cx]) continue; // overlaps a finder
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }

      const formatBits = (mask) => {
        const data = (1 << 3) | mask; // level L = 01
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412;
        const bit = (i) => ((bits >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) set(8, i, bit(i));
        set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
        for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
        set(8, size - 8, true);
      };
      formatBits(0);

      const data = codewords(bytes, version);
      let bitIndex = 0;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (fixed[y * size + x] || bitIndex >= data.length * 8) continue;
          mod[y * size + x] = (data[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        }
      }

      const applyMask = (m) => {
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y * size + x] && MASKS[m](x, y)) mod[y * size + x] ^= 1;
      };
      const penalty = () => {
        let score = 0;
        const lines = [];
        for (let y = 0; y < size; y++) { let row = ''; let col = ''; for (let x = 0; x < size; x++) { row += mod[y * size + x]; col += mod[x * size + y]; } lines.push(row, col); }
        for (const line of lines) {
          for (const run of line.match(/(.)\1{4,}/g) || []) score += run.length - 2;
          const padded = `0000${line}0000`;
          for (const needle of ['00001011101', '10111010000']) for (let i = padded.indexOf(needle); i >= 0; i = padded.indexOf(needle, i + 1)) score += 40;
        }
        for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
          const c = mod[y * size + x];
          if (c === mod[y * size + x + 1] && c === mod[(y + 1) * size + x] && c === mod[(y + 1) * size + x + 1]) score += 3;
        }
        let dark = 0;
        for (const v of mod) dark += v;
        score += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
        return score;
      };
      let best = 0; let bestScore = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(m); formatBits(m);
        const s = penalty();
        if (s < bestScore) { bestScore = s; best = m; }
        applyMask(m);
      }
      applyMask(best); formatBits(best);
      return { size, mod };
    }

    function path(code, quiet = 4) {
      let d = '';
      for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.mod[y * code.size + x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      return { d, extent: code.size + quiet * 2 };
    }

    return { encode, path };
  })();

  /* ------------------------------------------------------------------ background: liquid noise + orbit */
  function liquidBackground() {
    const noise = $('#bg-noise');
    const warp = $('#bg-warp');
    const sat = $('#bg-sat');
    const halo = $('#bg-halo');
    const trail = $('#bg-trail');
    if (!noise || !warp) return;
    let raf = 0;
    let last = -1;

    // The satellite rides the orbit ring (same ellipse as the SVG) and drags a short trail behind it,
    // so it reads as a body in motion even in a single frame.
    const ORBIT = { cx: 720, cy: 470, rx: 664, ry: 292, period: 26000 };
    const orbitPoint = (a) => [ORBIT.cx + ORBIT.rx * Math.cos(a), ORBIT.cy + ORBIT.ry * Math.sin(a)];

    const paint = (t) => {
      const bx = 0.0085 + 0.003 * Math.sin(t / 4200);
      const by = 0.0125 + 0.0035 * Math.cos(t / 5600);
      noise.setAttribute('baseFrequency', `${bx.toFixed(5)} ${by.toFixed(5)}`);
      warp.setAttribute('scale', (9 + 4 * Math.sin(t / 3600)).toFixed(2));
      if (!sat) return;
      const a = (t / ORBIT.period) * Math.PI * 2;
      const [x, y] = orbitPoint(a);
      sat.setAttribute('cx', x.toFixed(1));
      sat.setAttribute('cy', y.toFixed(1));
      if (halo) { halo.setAttribute('cx', x.toFixed(1)); halo.setAttribute('cy', y.toFixed(1)); }
      if (trail) {
        const steps = 14;
        const span = 0.42; // radians of arc behind the satellite
        let d = '';
        for (let i = steps; i >= 0; i--) {
          const [px, py] = orbitPoint(a - (span * i) / steps);
          d += `${i === steps ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
        }
        trail.setAttribute('d', d);
      }
    };
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      // The field drifts slowly, so ~6 updates/s already reads as continuous and keeps the filter cheap.
      if (t - last < 160) return;
      last = t;
      paint(t);
    };
    const start = () => { if (!raf && !reduceMotion.matches && !doc.hidden) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    paint(0);
    doc.addEventListener('visibilitychange', () => (doc.hidden ? stop() : start()));
    reduceMotion.addEventListener('change', () => (reduceMotion.matches ? stop() : start()));
    start();
  }

  /* ------------------------------------------------------------------ phone carousel */
  function carousel() {
    const track = $('#track');
    const screen = $('#screen');
    if (!track) return;
    const slides = Array.from(track.children);
    const dots = $$('.dot');
    const benefits = $$('.benefit');
    let current = 0;

    const show = (index, { announceIt = false } = {}) => {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(${-current * 100}%)`;
      slides.forEach((slide, i) => {
        slide.setAttribute('aria-hidden', String(i !== current));
        slide.toggleAttribute('inert', i !== current);
      });
      dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
      benefits.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.screen) === current)));
      if (announceIt) announce(copy('screen-shown', { n: current + 1, total: slides.length, title: slides[current].getAttribute('aria-label') }));
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => show(i, { announceIt: true }));
      dot.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, Home: -current, End: slides.length - 1 - current }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        show(current + step, { announceIt: true });
        dots[current].focus();
      });
    });

    for (const b of benefits) {
      const target = () => show(Number(b.dataset.screen));
      b.addEventListener('pointerenter', target);
      b.addEventListener('focus', target);
      b.addEventListener('click', () => show(Number(b.dataset.screen), { announceIt: true }));
    }

    // Swipe on the screen itself.
    let startX = null;
    screen.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    screen.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1), { announceIt: true });
    });

    show(0);
  }

  /* ------------------------------------------------------------------ platforms + QR */
  const state = { platform: 'phone', links: {} };

  // Show the link without its scheme and let it break only at the path, never mid-word.
  function renderLinkText(el, url) {
    const shown = url.replace(/^https?:\/\//, '');
    const slash = shown.indexOf('/');
    if (slash < 0) { el.textContent = shown; return; }
    el.replaceChildren(shown.slice(0, slash), doc.createElement('wbr'), shown.slice(slash));
  }

  function renderQr(url) {
    const svg = $('#qr-code');
    const pathEl = $('#qr-path');
    if (!svg || !pathEl) return;
    const code = QR.encode(url);
    if (!code) return;
    const { d, extent } = QR.path(code);
    svg.setAttribute('viewBox', `0 0 ${extent} ${extent}`);
    pathEl.setAttribute('d', d);
  }

  function platforms() {
    const buttons = $$('.platform');
    const caption = $('#qr-caption-text');
    const linkEl = $('#qr-link-text');
    const figure = $('.qr');
    for (const b of buttons) state.links[b.dataset.platform] = b.dataset.link;

    const select = (platform, { animate = true } = {}) => {
      const btn = buttons.find((b) => b.dataset.platform === platform);
      if (!btn) return;
      state.platform = platform;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
      caption.textContent = btn.dataset.caption;
      renderLinkText(linkEl, state.links[platform]);
      renderQr(state.links[platform]);
      if (animate && figure) {
        figure.classList.remove('is-redrawing');
        void figure.offsetWidth; // restart the reveal
        figure.classList.add('is-redrawing');
        announce(copy('qr-switched', { platform: $('.platform-label', btn).textContent.trim() }));
      }
    };
    for (const b of buttons) b.addEventListener('click', () => select(b.dataset.platform));
    figure?.addEventListener('animationend', () => figure.classList.remove('is-redrawing'));
    select('phone', { animate: false });
    return { select };
  }

  /* ------------------------------------------------------------------ direct downloads (small screens)
     The links open in a new tab, so the card stays and confirms what just happened. */
  function downloads() {
    const links = $$('.download');
    const status = $('#downloads-status');
    for (const link of links) {
      link.addEventListener('click', () => {
        for (const l of links) l.classList.toggle('is-chosen', l === link);
        if (status) status.textContent = link.dataset.confirm || '';
      });
    }
    return {
      setLinks(map) {
        for (const link of links) if (map[link.dataset.platform]) link.href = map[link.dataset.platform];
      },
    };
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to the legacy path */ }
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    doc.body.append(area);
    area.select();
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }

  function copyLink() {
    const btn = $('#qr-link');
    if (!btn) return;
    const label = $('.qr-link-text', btn);
    let timer = 0;
    btn.addEventListener('click', async () => {
      const url = state.links[state.platform];
      const ok = await copyText(url);
      announce(copy(ok ? 'copied' : 'copy-failed'));
      if (!ok) return;
      btn.classList.add('is-copied');
      label.textContent = btn.dataset.labelCopied;
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove('is-copied');
        renderLinkText(label, url);
      }, 1800);
    });
  }

  /* ------------------------------------------------------------------ send-me-the-link form */
  const normalizePhone = (v) => v.replace(/[\s().-]/g, '');
  const isE164 = (v) => /^\+[1-9]\d{6,14}$/.test(v);
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function sendForm() {
    const form = $('#send-form');
    if (!form) return;
    const stack = $('.send-stack');
    const input = $('#destination');
    const fieldLabel = $('.field-label', form);
    const hint = $('#destination-hint');
    const submit = $('.btn-send', form);
    const submitLabel = $('.btn-label', submit);
    const sentDest = $('#sent-destination');
    const sentMessage = $('#sent-message');
    const again = $('#send-again');
    const idleLabel = submitLabel.textContent;
    let busy = false;

    const channel = () => form.channel.value;

    const clearError = () => {
      input.removeAttribute('aria-invalid');
      hint.classList.remove('is-error');
      hint.textContent = hint.dataset.hint;
    };
    const showError = (text) => {
      input.setAttribute('aria-invalid', 'true');
      hint.classList.add('is-error');
      hint.textContent = text;
    };

    const applyChannel = () => {
      const c = channel();
      const isSms = c === 'sms';
      fieldLabel.textContent = fieldLabel.dataset[isSms ? 'labelSms' : 'labelEmail'];
      input.placeholder = input.dataset[isSms ? 'placeholderSms' : 'placeholderEmail'];
      input.type = isSms ? 'tel' : 'email';
      input.inputMode = isSms ? 'tel' : 'email';
      input.autocomplete = isSms ? 'tel' : 'email';
      again.textContent = again.dataset[isSms ? 'labelSms' : 'labelEmail'];
      clearError();
    };
    for (const radio of form.channel) radio.addEventListener('change', applyChannel);

    const setBusy = (on) => {
      busy = on;
      submit.disabled = on;
      submit.setAttribute('aria-busy', String(on));
      submitLabel.textContent = on ? copy('sending') : idleLabel;
    };

    const validate = (raw) => {
      const c = channel();
      if (!raw) return { error: `required-${c}` };
      if (c === 'sms') {
        const value = normalizePhone(raw);
        return isE164(value) ? { value } : { error: 'invalid-sms' };
      }
      return isEmail(raw) ? { value: raw } : { error: 'invalid-email' };
    };

    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) clearError(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const { value, error } = validate(input.value.trim());
      if (error) {
        showError(copy(error));
        input.focus();
        return;
      }
      setBusy(true);
      try {
        const res = await fetch('/api/app-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ channel: channel(), destination: value, platform: state.platform, company: form.company.value }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          sentDest.textContent = body.maskedDestination || value;
          sentMessage.textContent = body.message || '';
          stack.classList.add('is-sent');
        } else {
          showError(body.message || copy('failed'));
        }
      } catch {
        showError(copy('network'));
      } finally {
        setBusy(false);
      }
    });

    again.addEventListener('click', () => {
      stack.classList.remove('is-sent');
      input.value = '';
      clearError();
      input.focus();
    });

    applyChannel();
  }

  /* ------------------------------------------------------------------ data + formatting */
  function localizeTimes() {
    for (const el of $$('time[data-format]')) {
      const date = new Date(el.getAttribute('datetime'));
      if (Number.isNaN(date.getTime())) continue;
      const base = { timeZone: el.dataset.tz || undefined };
      const opts = el.dataset.format === 'daytime'
        ? { ...base, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : { ...base, day: 'numeric', month: 'short' };
      try { el.textContent = new Intl.DateTimeFormat(lang, opts).format(date); } catch { /* keep the authored text */ }
    }
  }

  async function loadApp(qr, direct) {
    const compact = new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 });
    const oneDecimal = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    try {
      const res = await fetch('/api/app', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.rating && typeof data.rating.average === 'number') {
        $('[data-field="rating"]').textContent = oneDecimal.format(data.rating.average);
        $('.rating').style.setProperty('--rating', String(data.rating.average));
        if (typeof data.rating.count === 'number') $('[data-field="ratingCount"]').textContent = compact.format(data.rating.count);
      }
      if (typeof data.downloads === 'number') $('[data-field="downloads"]').textContent = compact.format(data.downloads);
      if (data.links && typeof data.links === 'object') {
        const changed = Object.keys(data.links).some((k) => data.links[k] !== state.links[k]);
        Object.assign(state.links, data.links);
        if (changed) qr.select(state.platform, { animate: false });
        direct.setLinks(state.links);
      }
    } catch { /* the authored defaults stay on screen */ }
  }

  liquidBackground();
  carousel();
  const qr = platforms();
  const direct = downloads();
  copyLink();
  sendForm();
  localizeTimes();
  loadApp(qr, direct);
})();
