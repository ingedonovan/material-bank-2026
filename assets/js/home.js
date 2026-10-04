/*
  Home page: totals, carbon by lifecycle phase, and a filterable index.
  Filters: tick boxes for tag and status, plus a search box for name, ID and place.
  The totals and the phase bar follow the filters.
*/
(async function () {
  const { load, fmt, thumb, CFG, STATUSES } = window.Bank;
  const app = document.getElementById("app");
  let mats;
  try {
    mats = await load();
  } catch (err) {
    app.innerHTML = `<p class="status">The data could not be loaded. If you opened this file directly, run it through a local server (see README).</p>`;
    console.error(err);
    return;
  }

  const tags = [...new Set(mats.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b));
  const statuses = STATUSES.filter((s) => mats.some((m) => m.status === s));
  const slug = (s) => s.replace(/\s+/g, "-").toLowerCase();
  const box = (group, v) => `<label class="check"><input type="checkbox" data-group="${group}" value="${fmt.esc(v)}" checked autocomplete="off"><span>${fmt.esc(v)}</span><span class="count" data-count="${group}:${fmt.esc(v)}"></span></label>`;

  app.innerHTML = `
    <section class="intro">
      <div class="intro-top"><h1 class="title-logo"><img class="logo" src="assets/img/fa-logo.png" alt="Future Assemblies"><span>Material Bank</span></h1><a class="nav-display" href="display/index.html">Display →</a></div>
      <dl class="stats" id="stats"></dl>
    </section>

    <details class="block fold" id="map-fold" open>
      <summary><h2>Where they are <span class="h2-note" id="map-note"></span></h2></summary>
      <div id="homemap" class="map"></div>
      <p class="legend"><span class="key key-reconf"></span>Current location (size = number of materials) <span class="route-key"></span>Routes they have travelled (thicker = more materials)</p>
    </details>

    <details class="block fold" id="ec-fold" open>
      <summary><h2>Carbon by lifecycle phase <span class="h2-note" id="ec-note"></span></h2></summary>
      <div id="ecbar"></div>
    </details>

    <section class="block">
      <h2>Index</h2>
      <div class="filters">
        <fieldset><legend>Tag</legend>${tags.map((t) => box("tag", t)).join("")}</fieldset>
        <fieldset><legend>Status</legend>${statuses.map((s) => box("status", s)).join("")}</fieldset>
        <label class="search"><span class="legend-like">Search</span><input id="q" type="search" placeholder="Name, ID or place" autocomplete="off"></label>
      </div>
      <p class="showing" id="showing"></p>
      <ul class="grid" id="grid">
        ${mats.map((m) => `
          <li data-id="${fmt.esc(m.id)}" class="status-${slug(m.status)}">
            <a href="m/index.html?id=${encodeURIComponent(m.id)}">
              <div class="thumb">
                <img alt="" loading="lazy" data-id="${fmt.esc(m.id)}">
                <div class="thumb-tags">${m.tags.map((t) => `<span class="tag-chip">${fmt.esc(t)}</span>`).join("")}</div>
                ${m.status !== "In use" ? `<span class="thumb-status">${fmt.esc(m.status)}</span>` : ""}
              </div>
              <div class="card-id">${fmt.esc(m.id)}</div>
              <div class="card-meta">${fmt.esc(m.type)} · ${fmt.esc(m.condition || "—")}</div>
              <div class="card-meta">${m.reconfigurations} reconfig. · ${fmt.carbon(m.totalCarbon)} ${CFG.carbonUnit}</div>
            </a>
          </li>`).join("")}
      </ul>
    </section>
  `;

  const byId = Object.fromEntries(mats.map((m) => [m.id, m]));
  document.querySelectorAll("#grid img").forEach((img) => thumb(img, byId[img.dataset.id].thumbs));

  // Search text for each material: name, ID and every place in its life.
  const text = Object.fromEntries(mats.map((m) => [m.id, [m.id, m.name, m.type, m.origin, ...m.lifecycle.map((s) => s.place)].join(" ").toLowerCase()]));

  // ---- Collective map: where the shown materials are now, and the routes they took ----
  const map = L.map("homemap", { scrollWheelZoom: false, worldCopyJump: true });
  L.tileLayer(CFG.tiles, { attribution: CFG.tilesAttribution, maxZoom: CFG.tilesMaxZoom || 18 }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let fitted = false;
  function drawMap(shown) {
    layer.clearLayers();
    const here = new Map(), legs = new Map();
    let unplaced = 0;
    shown.forEach((m) => {
      const stops = m.lifecycle.filter((s) => s.coords);
      if (!stops.length) { unplaced++; return; }
      const last = stops[stops.length - 1];
      const k = last.coords.join(",");
      if (!here.has(k)) here.set(k, { coords: last.coords, place: last.place, ids: [] });
      here.get(k).ids.push(m.id);
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1].coords, b = stops[i].coords;
        if (a[0] === b[0] && a[1] === b[1]) continue;
        const key = [a, b].map((c) => c.join(",")).sort().join("|");
        if (!legs.has(key)) legs.set(key, { a, b, n: new Set() });
        legs.get(key).n.add(m.id);
      }
    });
    legs.forEach((l) => L.polyline([l.a, l.b], { className: "route-all", weight: 1 + Math.sqrt(l.n.size) * 0.8, interactive: false }).addTo(layer));
    const pts = [];
    here.forEach((h) => {
      pts.push(h.coords);
      const n = h.ids.length;
      L.circleMarker(h.coords, { radius: 5 + Math.sqrt(n) * 2.2, className: "stop stop-reconf here", weight: 1.5 })
        .bindPopup(`<strong>${fmt.esc(h.place)}</strong><br>${n} material${n === 1 ? "" : "s"}<div class="popup-ids">${h.ids.map((id) => `<a href="m/index.html?id=${encodeURIComponent(id)}">${fmt.esc(id)}</a>`).join(" ")}</div>`)
        .bindTooltip(String(n), { permanent: true, direction: "center", className: "count-label" })
        .addTo(layer);
    });
    legs.forEach((l) => pts.push(l.a, l.b));
    if (pts.length && !fitted) { map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 10 }); fitted = true; }
    if (!pts.length) map.setView([45, -40], 2);
    document.getElementById("map-note").textContent = `· ${here.size} place${here.size === 1 ? "" : "s"} now${unplaced ? ` · ${unplaced} without a known location` : ""}`;
  }

  function apply() {
    const on = (g) => new Set([...document.querySelectorAll(`input[data-group="${g}"]:checked`)].map((i) => i.value));
    const tOn = on("tag"), sOn = on("status");
    const q = document.getElementById("q").value.trim().toLowerCase();
    const shown = mats.filter((m) =>
      (m.tags.length ? m.tags.some((t) => tOn.has(t)) : true) && sOn.has(m.status) && (!q || text[m.id].includes(q)));
    const ids = new Set(shown.map((m) => m.id));
    document.querySelectorAll("#grid li").forEach((li) => (li.hidden = !ids.has(li.dataset.id)));

    // counts beside each tick box (within the other filters)
    tags.forEach((t) => (document.querySelector(`[data-count="tag:${CSS.escape(t)}"]`).textContent =
      mats.filter((m) => m.tags.includes(t) && sOn.has(m.status) && (!q || text[m.id].includes(q))).length));
    statuses.forEach((s) => (document.querySelector(`[data-count="status:${CSS.escape(s)}"]`).textContent =
      mats.filter((m) => m.status === s && (m.tags.length ? m.tags.some((t) => tOn.has(t)) : true) && (!q || text[m.id].includes(q))).length));

    const total = shown.reduce((a, m) => a + m.totalCarbon, 0);
    const reconf = shown.reduce((a, m) => a + m.reconfigurations, 0);
    const places = new Set(shown.flatMap((m) => m.lifecycle.filter((s) => s.place).map((s) => s.place)));
    const years = shown.filter((m) => m.manufacture.date.known).map((m) => m.manufacture.date.year);
    document.getElementById("stats").innerHTML = `
      <div><dt>Materials</dt><dd>${shown.length}</dd></div>
      <div><dt>Total mass</dt><dd>${fmt.mass(shown.reduce((a, m) => a + (m.mass || 0), 0))}</dd></div>
      <div><dt>Reconfigurations</dt><dd>${reconf}</dd></div>
      <div><dt>Places</dt><dd>${places.size}</dd></div>
      <div><dt>Oldest</dt><dd>${years.length ? Math.min(...years) : "—"}</dd></div>
      <div><dt>Carbon recorded</dt><dd>${fmt.carbon(total, 0)} <small>${CFG.carbonUnit}</small></dd></div>`;
    document.getElementById("showing").textContent = shown.length === mats.length ? `All ${mats.length} materials` : `Showing ${shown.length} of ${mats.length} materials`;

    const phases = {};
    shown.forEach((m) => Object.entries(m.phases).forEach(([k, v]) => (phases[k] = (phases[k] || 0) + v)));
    document.getElementById("ec-note").textContent = shown.length === mats.length ? "· all materials" : `· ${shown.length} filtered material${shown.length === 1 ? "" : "s"}`;
    window.ECBar.render(document.getElementById("ecbar"), phases, { label: "Carbon by lifecycle phase, all shown materials" });
    drawMap(shown);
  }

  document.querySelectorAll(".filters input").forEach((i) => i.addEventListener("input", apply));
  // Remember whether the carbon bar is shown or hidden (this browser only).
  // Remember which sections are hidden (this browser only).
  [["ec-fold", "ecFold"], ["map-fold", "mapFold"]].forEach(([id, key]) => {
    const fold = document.getElementById(id);
    try { if (localStorage.getItem(key) === "closed") fold.open = false; } catch (e) {}
    fold.addEventListener("toggle", () => {
      try { localStorage.setItem(key, fold.open ? "open" : "closed"); } catch (e) {}
      if (id === "map-fold" && fold.open) setTimeout(() => map.invalidateSize(), 50);
    });
  });
  // Browsers can restore old filter settings when you go back; re-apply them when the page reappears.
  window.addEventListener("pageshow", apply);
  apply();
})();
