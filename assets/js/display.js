/*
  Display page: every material in use, floating in a field larger than the screen.
  - Ambient drift: each object wanders slowly on its own path.
  - Mouse: moving the pointer pans the view (near objects move more than far ones),
    and objects ease away from the pointer.
  - Hover: faint lines to every object it shared an assembly with.
  - Click: a small card in place. Esc or click elsewhere to close.
  With no mouse movement for a while (e.g. on a projected wall) the view drifts on its own.
*/
(async function () {
  const { load, fmt, thumb, CFG } = window.Bank;
  const field = document.getElementById("field");
  const svg = document.getElementById("links");
  const card = document.getElementById("card");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let mats;
  try {
    mats = (await load()).filter((m) => m.status !== "Retired");
  } catch (err) {
    field.innerHTML = `<p class="status">The data could not be loaded.</p>`;
    console.error(err);
    return;
  }
  document.getElementById("count").textContent = `${mats.length} materials in use`;

  // ---- shared assemblies: objects that took part in the same reconfiguration ----
  const groups = new Map();
  mats.forEach((m) => {
    m._keys = new Set(m.events.filter((e) => e.reconfiguration).map((e) => `${e.what}|${e.date.t ?? "?"}|${e.place}`));
    m._keys.forEach((k) => { if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(m); });
  });
  const partners = (m) => { const s = new Set(); m._keys.forEach((k) => groups.get(k).forEach((o) => o !== m && s.add(o))); return s; };

  // ---- layout: jittered grid over a field larger than the screen ----
  const rnd = (a, b) => a + Math.random() * (b - a);
  const n = mats.length;
  const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
  const order = mats.map((m, i) => i).sort(() => Math.random() - 0.5);
  const icon = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3"/><path d="M12 2v3h-3M4 14v-3h3"/></svg>';

  const objs = mats.map((m, i) => {
    const slot = order[i], c = slot % cols, r = Math.floor(slot / cols);
    const o = {
      m,
      nx: (c + 0.5 + rnd(-0.32, 0.32)) / cols,
      ny: (r + 0.5 + rnd(-0.32, 0.32)) / rows,
      d: rnd(0.45, 1),                       // depth: 1 = near
      ax: rnd(10, 34), ay: rnd(8, 26), fx: rnd(0.025, 0.06), fy: rnd(0.02, 0.05), p: rnd(0, Math.PI * 2),
      rx: 0, ry: 0, x: 0, y: 0, s: 0,
    };
    const el = document.createElement("button");
    el.type = "button";
    el.className = "dobj";
    el.title = `${m.id} · ${m.name}`;
    el.style.zIndex = Math.round(o.d * 100);
    el.style.opacity = (0.55 + 0.45 * o.d).toFixed(2);
    el.innerHTML = `<img alt="">
      <span class="d-id">${fmt.esc(m.id)}</span>
      <span class="d-rc">${icon}${m.reconfigurations}</span>
      <span class="d-ec">${m.lifecycle.some((s) => s.carbon != null) ? fmt.carbon(m.totalCarbon, 1) : "—"}</span>`;
    thumb(el.querySelector("img"), m.thumbs);
    field.appendChild(el);
    o.el = el;
    return o;
  });

  // ---- view state ----
  let W, H, size;
  function measure() {
    W = innerWidth * 1.6; H = innerHeight * 1.6;
    size = Math.max(60, Math.min(118, innerWidth / 15));
    objs.forEach((o) => { o.s = size * (0.72 + 0.28 * o.d); o.el.style.width = o.el.style.height = o.s + "px"; });
    svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
  }
  measure();
  addEventListener("resize", measure);

  const mouse = { x: innerWidth / 2, y: innerHeight / 2, in: false, last: -1e9 };
  const cam = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; mouse.last = performance.now(); } });
  document.addEventListener("pointerleave", () => (mouse.in = false));

  // ---- hover: trace shared assemblies ----
  let hover = null, linked = new Set(), lines = [];
  function setHover(o) {
    if (hover === o) return;
    hover = o;
    objs.forEach((x) => x.el.classList.remove("lit", "focus"));
    svg.innerHTML = ""; lines = [];
    field.classList.toggle("dim", !!o);
    if (!o) return;
    linked = partners(o.m);
    o.el.classList.add("focus");
    objs.forEach((x) => { if (linked.has(x.m)) {
      x.el.classList.add("lit");
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      svg.appendChild(l); lines.push([x, l]);
    } });
  }
  objs.forEach((o) => {
    o.el.addEventListener("mouseenter", () => setHover(o));
    o.el.addEventListener("mouseleave", () => setHover(null));
    o.el.addEventListener("focus", () => setHover(o));
    o.el.addEventListener("blur", () => setHover(null));
    o.el.addEventListener("click", (e) => { e.stopPropagation(); openCard(o); });
  });

  // ---- click: small card in place ----
  let open = null;
  function openCard(o) {
    const m = o.m;
    open = o;
    const pc = linked && hover === o ? linked.size : partners(m).size;
    card.innerHTML = `
      <button type="button" class="dcard-x" aria-label="Close">×</button>
      <div class="dcard-id">${fmt.esc(m.id)}</div>
      <div class="dcard-name">${fmt.esc(m.name)}</div>
      <dl>
        <div><dt>Material</dt><dd>${fmt.esc(m.type || "—")}</dd></div>
        <div><dt>Now at</dt><dd>${fmt.esc(m.currentPlace || "Unknown")}</dd></div>
        <div><dt>Made</dt><dd>${fmt.esc(m.manufacture.date.label)}${m.manufacture.place ? " · " + fmt.esc(m.manufacture.place) : ""}</dd></div>
        <div><dt>Reconfigurations</dt><dd>${m.reconfigurations}${pc ? ` <span class="muted">· shared with ${pc} other${pc === 1 ? "" : "s"}</span>` : ""}</dd></div>
        <div><dt>Carbon to date</dt><dd>${fmt.carbon(m.totalCarbon)} <small>${CFG.carbonUnit}</small>${m.a1a3 != null ? ` <span class="muted">· A1–A3 ${fmt.carbon(m.a1a3)}</span>` : ""}</dd></div>
      </dl>
      <a class="dcard-go" href="../m/index.html?id=${encodeURIComponent(m.id)}">Open material page →</a>`;
    card.hidden = false;
    card.querySelector(".dcard-x").addEventListener("click", closeCard);
    placeCard();
  }
  function placeCard() {
    if (!open) return;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = open.x + open.s + 14, top = open.y - 10;
    if (left + cw > innerWidth - 12) left = open.x - cw - 14;
    left = Math.max(12, left);
    top = Math.max(60, Math.min(top, innerHeight - ch - 12));
    card.style.transform = `translate(${left}px, ${top}px)`;
  }
  function closeCard() { open = null; card.hidden = true; }
  document.addEventListener("click", (e) => { if (open && !card.contains(e.target)) closeCard(); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCard();
    if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) toggleFs();
  });

  // ---- full screen (for the projected wall) ----
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
  document.getElementById("fs").addEventListener("click", toggleFs);

  // ---- animation ----
  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    const idle = !mouse.in || now - mouse.last > 8000;
    // camera: follows the pointer; when idle, wanders slowly on its own
    const spanX = (W - innerWidth) / 2, spanY = (H - innerHeight) / 2;
    const tx = idle ? Math.sin(t * 0.031) * spanX * 0.8 : ((mouse.x / innerWidth) - 0.5) * 2 * spanX;
    const ty = idle ? Math.sin(t * 0.023 + 1) * spanY * 0.8 : ((mouse.y / innerHeight) - 0.5) * 2 * spanY;
    const k = reduce ? 0.2 : 0.035;
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;

    for (const o of objs) {
      const par = 0.45 + 0.55 * o.d;  // far objects move less with the camera
      const amb = reduce ? 0 : 1;
      let x = o.nx * W - spanX - cam.x * par + amb * o.ax * Math.sin(t * o.fx * 6.283 + o.p);
      let y = o.ny * H - spanY - cam.y * par + amb * o.ay * Math.cos(t * o.fy * 6.283 + o.p * 1.3);
      // ease away from the pointer
      let px = 0, py = 0;
      if (mouse.in && !idle && o !== hover) {
        const dx = x + o.s / 2 - mouse.x, dy = y + o.s / 2 - mouse.y, dist = Math.hypot(dx, dy), R = 170;
        if (dist < R && dist > 0.1) { const f = (1 - dist / R) ** 2 * 46; px = (dx / dist) * f; py = (dy / dist) * f; }
      }
      o.rx += (px - o.rx) * 0.08; o.ry += (py - o.ry) * 0.08;
      o.x = x + o.rx; o.y = y + o.ry;
      o.el.style.transform = `translate3d(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px, 0)`;
    }
    if (hover) {
      const hx = hover.x + hover.s / 2, hy = hover.y + hover.s / 2;
      for (const [o, l] of lines) {
        l.setAttribute("x1", hx); l.setAttribute("y1", hy);
        l.setAttribute("x2", o.x + o.s / 2); l.setAttribute("y2", o.y + o.s / 2);
      }
    }
    placeCard();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
