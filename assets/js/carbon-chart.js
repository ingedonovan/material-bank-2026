/*
  Cumulative carbon as a step chart: starts at A1–A3, steps up at every
  event that carries a carbon value. Plain SVG, no chart library.
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function render(container, material) {
    const { fmt, CFG } = window.Bank;
    const dated = material.lifecycle.filter((s) => s.date.known);
    if (!material.lifecycle.some((x) => x.carbon != null) || (!dated.length && material.totalCarbon === 0)) {
      container.innerHTML = '<p class="empty">No carbon recorded yet.</p>';
      return;
    }

    // Time range: first known date to now-ish; unknown manufacture sits at the left edge.
    const times = dated.map((s) => s.date.t);
    const nowT = Date.now();
    let t0 = Math.min(...times, nowT);
    let t1 = Math.max(...times);
    t1 = Math.max(t1, Math.min(nowT, t1 + 365 * 864e5));
    const span = Math.max(t1 - t0, 365 * 864e5);
    const pad = span * 0.04;
    const madeUnknown = !material.manufacture.date.known;
    const x0 = t0 - pad - (madeUnknown ? span * 0.08 : 0);
    const x1 = t1 + pad;

    // Drawn at the container's real pixel width so text stays the same size on every screen.
    const W = Math.max(280, container.clientWidth || 720);
    const H = W < 560 ? 220 : 280, m = { t: 24, r: 16, b: 34, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const yStep = niceMax(material.totalCarbon * 1.08 / 4);
    const ticks = Math.max(1, Math.ceil((material.totalCarbon * 1.08) / yStep));
    const yMax = yStep * ticks;
    const X = (t) => m.l + ((t - x0) / (x1 - x0)) * iw;
    const Y = (v) => m.t + ih - (v / yMax) * ih;

    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "chart-wrap";
    container.appendChild(wrap);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img",
      "aria-label": `Cumulative carbon over time, reaching ${fmt.carbon(material.totalCarbon)} ${CFG.carbonUnit}` }, wrap);

    // Grid + y axis
    for (let i = 0; i <= ticks; i++) {
      const v = yStep * i, y = Y(v);
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: i === 0 ? "axis" : "grid" }, svg);
      el("text", { x: m.l - 8, y: y + 4, class: "tick", "text-anchor": "end" }, svg).textContent = fmt.carbon(v, 1);
    }
    el("text", { x: m.l, y: 11, class: "tick" }, svg).textContent = CFG.carbonUnit + ", cumulative";

    // x axis: years
    const yA = new Date(x0).getUTCFullYear(), yB = new Date(x1).getUTCFullYear();
    const every = Math.max(1, Math.ceil((yB - yA + 1) / Math.max(2, Math.floor(iw / 70))));
    for (let yr = yA; yr <= yB + 1; yr += every) {
      const t = Date.UTC(yr, 0, 1);
      if (t < x0 || t > x1) continue;
      const x = X(t);
      el("line", { x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4, class: "axis" }, svg);
      el("text", { x, y: H - 12, class: "tick", "text-anchor": "middle" }, svg).textContent = yr;
    }

    // Build step path through dated carbon steps
    const pts = [];
    const startT = madeUnknown ? x0 + span * 0.02 : material.manufacture.date.t;
    let v = material.a1a3 || 0;
    pts.push({ t: startT, v, step: material.manufacture });
    material.events.forEach((s) => {
      if (s.carbon == null || !s.date.known) return;
      v += s.carbon;
      pts.push({ t: s.date.t, v, step: s });
    });
    const endT = Math.max(pts[pts.length - 1].t, Math.min(nowT, x1 - pad));
    let d = `M${X(pts[0].t)},${Y(0)} L${X(pts[0].t)},${Y(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) d += ` L${X(pts[i].t)},${Y(pts[i - 1].v)} L${X(pts[i].t)},${Y(pts[i].v)}`;
    d += ` L${X(endT)},${Y(pts[pts.length - 1].v)}`;
    el("path", { d: d + ` L${X(endT)},${Y(0)} Z`, class: "area" }, svg);
    el("path", { d, class: "line" }, svg);

    // Markers + hover
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    wrap.appendChild(tip);
    pts.forEach((p) => {
      const cx = X(p.t), cy = Y(p.v);
      el("circle", { cx, cy, r: 4.5, class: "dot" }, svg);
      const hit = el("circle", { cx, cy, r: 14, class: "hit", tabindex: 0 }, svg);
      const s = p.step;
      const label = s.kind === "manufacture" ? "A1–A3 · Manufacture" : `${s.module} · ${s.what}`;
      const html = `<strong>${fmt.esc(label)}</strong><span>${fmt.esc(s.date.label)}${s.place ? " · " + fmt.esc(s.place) : ""}</span>
        <span>+${fmt.carbon(s.carbon || 0)} → <b>${fmt.carbon(p.v)}</b> ${CFG.carbonUnit}</span>`;
      const show = () => {
        tip.innerHTML = html;
        tip.hidden = false;
        tip.style.left = Math.max(0, Math.min(cx - 20, W - 220)) + "px";
        tip.style.top = cy - 12 + "px";
      };
      hit.addEventListener("mouseenter", show);
      hit.addEventListener("focus", show);
      hit.addEventListener("click", show);
      hit.addEventListener("mouseleave", () => (tip.hidden = true));
      hit.addEventListener("blur", () => (tip.hidden = true));
    });

    // Direct label for the end value
    const last = pts[pts.length - 1];
    el("text", { x: X(endT) - 4, y: Y(last.v) - 8, class: "endlabel", "text-anchor": "end" }, svg)
      .textContent = `${fmt.carbon(material.totalCarbon)} ${CFG.carbonUnit}`;
    if (madeUnknown) {
      el("text", { x: X(startT) + 4, y: Y(pts[0].v) + 16, class: "tick" }, svg).textContent = "A1–A3, date unknown";
    }
  }

  // Redraw when the window is resized.
  function mount(container, material) {
    render(container, material);
    let w = container.clientWidth, timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (container.clientWidth !== w) { w = container.clientWidth; render(container, material); }
      }, 150);
    });
  }

  window.CarbonChart = { render: mount };
})();
