/* Material page: /m/?id=PX-0001 */
(async function () {
  const { load, fmt, thumb, MODULE_NAMES, CFG } = window.Bank;
  const app = document.getElementById("app");
  const id = (new URLSearchParams(location.search).get("id") || "").trim().toUpperCase();

  let materials;
  try {
    materials = await load();
  } catch (err) {
    app.innerHTML = `<p class="status">The data could not be loaded. If you opened this file directly, run it through a local server (see README).</p>`;
    console.error(err);
    return;
  }
  const mat = materials.find((m) => m.id === id);
  if (!mat) {
    app.innerHTML = `<p class="status">No material with ID <code>${fmt.esc(id || "(none)")}</code>. <a href="../index.html">Back to the bank</a>.</p>`;
    return;
  }

  document.title = `${mat.id} — ${CFG.title}`;
  document.getElementById("crumb").textContent = mat.id;
  const u = CFG.carbonUnit;

  const facts = [
    ["Material", mat.type || "—"],
    ["Mass", fmt.mass(mat.mass)],
    ["Origin", mat.origin],
    ["Age", mat.age ? `${mat.age.approx ? "c. " : ""}${mat.age.years} yr` : "Unknown"],
    ["Condition", mat.condition || "—"],
    ["Reconfigurations", mat.reconfigurations],
    ["Now at", mat.currentPlace || "Unknown", "wide"],
    ["Embodied carbon (A1–A3)", mat.a1a3 == null ? "—" : `${fmt.carbon(mat.a1a3)} <small>${u}</small>`],
    ["Carbon to date", mat.lifecycle.some((x) => x.carbon != null) ? `${fmt.carbon(mat.totalCarbon)} <small>${u}</small>` : "—"],
  ];

  app.innerHTML = `
    <section class="hero">
      <div class="viewer" id="viewer"></div>
      <div class="hero-text">
        <p class="tags">${mat.tags.map((t) => `<span class="tag-chip">${fmt.esc(t)}</span>`).join("")}<span class="status-chip status-${mat.status.replace(/\s+/g, "-").toLowerCase()}">${fmt.esc(mat.status)}</span></p>
        <h1 class="id">${fmt.esc(mat.id)}</h1>
        <p class="name">${fmt.esc(mat.name)}</p>
        <dl class="facts">
          ${facts.map(([k, v, w]) => `<div${w ? ' class="wide"' : ""}><dt>${k}</dt><dd>${typeof v === "string" && v.includes("<small>") ? v : fmt.esc(v)}</dd></div>`).join("")}
        </dl>
        ${mat.conditionNotes ? `<p class="note"><span>Condition notes</span> ${fmt.esc(mat.conditionNotes)}</p>` : ""}
      </div>
    </section>

    ${mat.story && !/^\[placeholder/i.test(mat.story) ? `<section class="block story"><h2>Story</h2><p>${fmt.esc(mat.story)}</p></section>` : ""}

    <section class="block">
      <h2>Where it has been</h2>
      <div id="map" class="map"></div>
      <p class="legend">
        <span class="key key-made"></span>Manufacture
        <span class="key key-reconf"></span>Reconfiguration
        <span class="key key-other"></span>Other event
        ${mat.lifecycle.some((s) => !s.coords) ? `<span class="muted">· ${mat.lifecycle.filter((s) => !s.coords).length} step(s) without a known location are listed below but not mapped</span>` : ""}
      </p>
    </section>

    <section class="block">
      <h2>Carbon by lifecycle phase</h2>
      <div id="ecbar"></div>
    </section>

    <section class="block">
      <h2>Carbon over time</h2>
      <div id="chart"></div>
    </section>

    <section class="block">
      <h2>Lifecycle</h2>
      <ol class="timeline">
        ${timelineHtml(mat)}
      </ol>
    </section>

    <p class="contrib">Recorded by ${fmt.esc(mat.contributor || "—")}</p>
  `;


  // Consecutive transport legs (A4 / C2) within ~6 weeks of each other are shown
  // as one "journey" row that expands to its legs. The map still draws every leg.
  function timelineHtml(mat) {
    const isLeg = (x) => x.kind === "event" && !x.reconfiguration && (x.module === "A4" || x.module === "C2") && x.date.known;
    const items = [];
    mat.lifecycle.forEach((x, i) => {
      const last = items[items.length - 1];
      if (isLeg(x) && last && last.legs && x.date.t - last.legs[last.legs.length - 1].date.t <= 45 * 864e5) last.legs.push(x);
      else if (isLeg(x)) items.push({ legs: [x], before: mat.lifecycle[i - 1] });
      else items.push(x);
    });
    const row = (x) => `
          <li class="${x.reconfiguration ? "is-reconf" : ""} ${x.kind}">
            <div class="t-date">${fmt.esc(x.date.label)}</div>
            <div class="t-module" title="${fmt.esc(MODULE_NAMES[x.module] || "")}">${fmt.esc(x.module || "—")}</div>
            <div class="t-body">
              <div class="t-what">${fmt.esc(x.what || "—")}${x.reconfiguration ? ' <span class="tag">Reconfiguration</span>' : ""}</div>
              <div class="t-meta">${fmt.esc(x.place || "Location unknown")}${x.condition && x.kind !== "manufacture" ? " · Condition: " + fmt.esc(x.condition) : ""}</div>
              ${x.working ? `<details class="t-working"><summary>Carbon working</summary>${fmt.esc(x.working)}</details>` : ""}
            </div>
            <div class="t-carbon">${x.carbon == null ? "" : "+" + fmt.carbon(x.carbon)}</div>
          </li>`;
    return items.map((it) => {
      if (!it.legs) return row(it);
      if (it.legs.length === 1) return row(it.legs[0]);
      const L0 = it.legs[0], Ln = it.legs[it.legs.length - 1];
      const from = (it.before && it.before.place) || L0.place || "?";
      const sum = it.legs.reduce((a, x) => a + (x.carbon || 0), 0);
      const mods = [...new Set(it.legs.map((x) => x.module))].join(" / ");
      return `
          <li class="journey">
            <div class="t-date">${fmt.esc(L0.date.label)}<br><span class="muted">to ${fmt.esc(Ln.date.label)}</span></div>
            <div class="t-module">${fmt.esc(mods)}</div>
            <div class="t-body">
              <div class="t-what">${fmt.esc(from)} → ${fmt.esc(Ln.place || "?")}</div>
              <details class="t-legs"><summary>${it.legs.length} legs</summary>
                <ol>${it.legs.map((x) => `<li><span class="muted">${fmt.esc(x.date.label)}</span> ${fmt.esc(x.what)}${x.carbon != null ? ` <span class="t-leg-c">+${fmt.carbon(x.carbon, 3)}</span>` : ""}${x.working ? `<div class="t-leg-w">${fmt.esc(x.working)}</div>` : ""}</li>`).join("")}</ol>
              </details>
            </div>
            <div class="t-carbon">+${fmt.carbon(sum)}</div>
          </li>`;
    }).join("");
  }

  // 3D scan (falls back to the image, then to a note)
  const viewer = document.getElementById("viewer");
  const mv = document.createElement("model-viewer");
  Object.assign(mv, { src: mat.model, alt: `3D scan of ${mat.id}` });
  mv.setAttribute("camera-controls", "");
  mv.setAttribute("auto-rotate", "");
  mv.setAttribute("auto-rotate-delay", "1500");
  mv.setAttribute("rotation-per-second", "12deg");
  mv.setAttribute("shadow-intensity", "0.6");
  mv.setAttribute("exposure", "1.05");
  mv.setAttribute("touch-action", "pan-y");
  mv.setAttribute("interaction-prompt", "none");
  mv.addEventListener("error", () => {
    viewer.innerHTML = "";
    const img = document.createElement("img");
    img.alt = mat.id;
    viewer.appendChild(img);
    viewer.classList.add("no-scan");
    thumb(img, mat.thumbs);
    const n = document.createElement("p");
    n.className = "viewer-note";
    n.textContent = "No 3D scan yet";
    viewer.appendChild(n);
  });
  viewer.appendChild(mv);

  // Map
  const stops = mat.lifecycle.filter((s) => s.coords);
  const map = L.map("map", { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
  L.tileLayer(CFG.tiles, { attribution: CFG.tilesAttribution, subdomains: CFG.tilesSubdomains || "abc", maxZoom: CFG.tilesMaxZoom || 18 }).addTo(map);
  if (stops.length) {
    const path = [];
    stops.forEach((s) => {
      const last = path[path.length - 1];
      if (!last || last[0] !== s.coords[0] || last[1] !== s.coords[1]) path.push(s.coords);
    });
    if (path.length > 1) L.polyline(path, { className: "route", weight: 2 }).addTo(map);

    // One marker per place, listing everything that happened there.
    const groups = new Map();
    stops.forEach((s) => {
      const k = s.coords.join(",");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    });
    groups.forEach((list) => {
      const kind = list.some((s) => s.kind === "manufacture") ? "made" : list.some((s) => s.reconfiguration) ? "reconf" : "other";
      const places = [...new Set(list.map((s) => s.place).filter(Boolean))].join(" / ");
      L.circleMarker(list[0].coords, { radius: 7, className: "stop stop-" + kind, weight: 2 })
        .bindPopup(`<strong>${fmt.esc(places)}</strong><ul>${list.map((s) => `<li>${fmt.esc(s.date.label)} · ${fmt.esc(s.module)} ${fmt.esc(s.what)}</li>`).join("")}</ul>`)
        .addTo(map);
    });
    const b = L.latLngBounds(path);
    if (path.length === 1) map.setView(path[0], 9);
    else map.fitBounds(b, { padding: [36, 36], maxZoom: 9 });
  } else {
    map.setView([30, -20], 2);
    document.getElementById("map").insertAdjacentHTML("beforeend", '<p class="map-empty">No locations recorded yet</p>');
  }

  window.CarbonChart.render(document.getElementById("chart"), mat);
  window.ECBar.render(document.getElementById("ecbar"), mat.phases, { label: `Carbon by lifecycle phase for ${mat.id}` });
})();
