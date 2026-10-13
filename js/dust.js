(function (L) {
  'use strict';

  // Kurz unoszący się w świetle świecy, w ciemnym motywie. Drobinki płyną powoli do góry,
  // lekko się kołyszą i są najjaśniejsze przy świecy w prawym górnym rogu.
  const CANDLE = { x: 0.9, y: 0.05 };
  const AREA_PER_PARTICLE = 15000;
  const MIN_COUNT = 25;
  const MAX_COUNT = 110;
  const EDGE = 8;

  function countFor(width, height) {
    return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round((width * height) / AREA_PER_PARTICLE)));
  }

  function createParticle(width, height, rand) {
    return {
      x: rand() * width,
      y: rand() * height,
      r: 1 + rand() * 2.2,
      speed: 4 + rand() * 10,
      phase: rand() * Math.PI * 2,
      swayAmp: 6 + rand() * 14,
      alpha: 0.5 + rand() * 0.5,
    };
  }

  function createParticles(width, height, rand) {
    const list = [];
    for (let i = countFor(width, height); i > 0; i--) list.push(createParticle(width, height, rand));
    return list;
  }

  // Ruch o dt sekund. Drobinka, która wyleci górą, wraca od dołu w losowym miejscu.
  function step(p, dt, width, height, rand) {
    p.y -= p.speed * dt;
    p.phase += dt * 0.6;
    if (p.y < -EDGE) {
      p.y = height + EDGE;
      p.x = rand() * width;
    }
    return p;
  }

  // Jasność światła w punkcie: 1 przy świecy, maleje z odległością do 0.25.
  function lightAt(x, y, width, height) {
    const distance = Math.hypot(x - CANDLE.x * width, y - CANDLE.y * height) / Math.hypot(width, height);
    return 0.25 + 0.75 * Math.max(0, 1 - distance / 0.75);
  }

  function draw(ctx, particles, width, height) {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const x = p.x + Math.sin(p.phase) * p.swayAmp;
      const a = p.alpha * lightAt(x, p.y, width, height);
      // Poświata wokół drobinki, potem jej jasny środek.
      ctx.fillStyle = 'rgba(255, 200, 120, ' + (a * 0.25).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, p.y, p.r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 230, 180, ' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Rysuje tylko w ciemnym motywie. Przy wyłączonych animacjach w systemie drobinki stoją.
  function start(canvas, win) {
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const doc = win.document;
    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let particles = [];
    let last = null;
    let visible = false;

    function resize() {
      const dpr = win.devicePixelRatio || 1;
      width = win.innerWidth;
      height = win.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(width, height, Math.random);
      visible = false;
    }

    function frame(now) {
      win.requestAnimationFrame(frame);
      const dark = doc.documentElement.dataset.theme !== 'light';
      if (!dark) {
        if (visible) ctx.clearRect(0, 0, width, height);
        visible = false;
        last = null;
        return;
      }
      const dt = last === null || reducedMotion.matches ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible && dt === 0) return;
      for (const p of particles) step(p, dt, width, height, Math.random);
      draw(ctx, particles, width, height);
      visible = true;
    }

    resize();
    win.addEventListener('resize', resize);
    win.requestAnimationFrame(frame);
  }

  L.dust = { countFor, createParticles, step, lightAt, start };
})(window.Labirynt = window.Labirynt || {});
