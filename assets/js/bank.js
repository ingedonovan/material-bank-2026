/*
  Loads the two tables (materials + events), keeps only approved rows,
  and works out everything the pages show: dates, lifecycle order,
  cumulative carbon, number of reconfigurations, current condition and location.
  Nothing here needs editing to add materials.
*/
(function () {
  const CFG = window.BANK_CONFIG;
  const ROOT = document.documentElement.dataset.root || "./";

  const url = (p) => (/^https?:\/\//.test(p) ? p : ROOT + p);

  const MODULE_NAMES = {
    "A1-A3": "Product stage (manufacture)",
    A4: "Transport to the site (delivery)",
    A5: "Construction / installation",
    B: "Use stage",
    C1: "Deconstruction",
    C2: "Transport away after use (removal)",
    C3: "Waste processing",
    C4: "Disposal",
    STORAGE: "Storage between uses (not an EN 15978 module)",
  };

  const truthy = (v) => /^(true|yes|y|1|x|✓)$/i.test(String(v || "").trim());
  const clean = (v) => String(v == null ? "" : v).trim();
  const num = (v) => {
    const s = clean(v).replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  function parseCoords(v) {
    const m = clean(v).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = Number(m[1]), lon = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  }

  // A date may be Known, Approximate or Unknown; month and day are optional.
  function parseDate(status, y, mo, d) {
    const st = clean(status).toLowerCase();
    const year = num(y);
    if (st === "unknown" || year == null) return { known: false, approx: false, t: null, label: "Date unknown" };
    const month = num(mo), day = num(d);
    const t = new Date(Date.UTC(year, month ? month - 1 : 0, day || 1)).getTime();
    const approx = st === "approximate";
    const monthName = month ? new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" }) : "";
    let label = [day && month ? day : "", monthName, year].filter(Boolean).join(" ");
    if (approx) label = "c. " + label;
    return { known: true, approx, t, year, label };
  }

  function csv(path) {
    return new Promise((resolve, reject) => {
      Papa.parse(url(path) + (/^https?:/.test(path) ? "" : "?v=" + Date.now()), {
        download: true,
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        complete: (r) => resolve(r.data),
        error: reject,
      });
    });
  }

  function buildMaterial(m, evRows) {
    const id = clean(m.material_id).toUpperCase();
    const made = parseDate(m.manufacture_date_status, m.manufacture_year, m.manufacture_month, m.manufacture_day);
    const madeKnownPlace = clean(m.manufacture_location_status).toLowerCase() !== "unknown";
    const madeCoords = madeKnownPlace ? parseCoords(m.manufacture_coordinates) : null;
    const a1a3 = num(m.a1a3_kgco2e);

    const manufacture = {
      kind: "manufacture",
      module: "A1-A3",
      reconfiguration: false,
      date: made,
      place: madeKnownPlace ? clean(m.manufacture_place) : "",
      coords: madeCoords,
      what: "Manufacture",
      carbon: a1a3,
      working: clean(m.carbon_working),
      condition: clean(m.condition_at_intake),
    };

    const events = evRows.map((e, i) => {
      const knownPlace = clean(e.location_status).toLowerCase() !== "unknown";
      return {
        kind: "event",
        order: i,
        module: clean(e.en15978_module).toUpperCase(),
        reconfiguration: truthy(e.reconfiguration),
        date: parseDate(e.date_status, e.year, e.month, e.day),
        place: knownPlace ? clean(e.place) : "",
        coords: knownPlace ? parseCoords(e.coordinates) : null,
        what: clean(e.what_happened),
        carbon: num(e.carbon_kgco2e),
        working: clean(e.carbon_working),
        condition: clean(e.condition_after),
      };
    });

    // Order: dated events by date (stable), undated events after, in entry order.
    events.sort((a, b) => {
      if (a.date.known && b.date.known) return a.date.t - b.date.t || a.order - b.order;
      if (a.date.known) return -1;
      if (b.date.known) return 1;
      return a.order - b.order;
    });

    const lifecycle = [manufacture, ...events];
    let running = 0;
    lifecycle.forEach((s) => {
      if (s.carbon != null) running += s.carbon;
      s.cumulative = running;
    });

    const lastWith = (key) => [...lifecycle].reverse().find((s) => s[key]);
    const condStep = lastWith("condition");
    const locStep = [...lifecycle].reverse().find((s) => s.coords);

    const now = new Date().getUTCFullYear();
    return {
      id,
      name: clean(m.name) || id,
      type: clean(m.material_type),
      mass: num(m.mass_kg),
      tags: clean(m.tags || m.cohort).split(/[;,]/).map((t) => t.trim()).filter(Boolean),
      story: clean(m.story),
      contributor: clean(m.contributor),
      conditionNotes: clean(m.condition_notes),
      manufacture,
      events,
      lifecycle,
      a1a3,
      totalCarbon: running,
      phases: phaseTotals(lifecycle),
      status: statusOf(lifecycle, clean(m.condition_at_intake)),
      reconfigurations: events.filter((e) => e.reconfiguration).length,
      condition: condStep ? condStep.condition : "",
      currentPlace: locStep ? locStep.place : "",
      origin: manufacture.place || "Unknown",
      age: made.known ? { years: now - made.year, approx: made.approx } : null,
      model: url(CFG.modelsBase + id + ".glb"),
      thumbs: CFG.thumbExtensions.map((x) => url(CFG.thumbsBase + id + "." + x)),
    };
  }

  // Lifecycle phases, in EN 15978 order. Each keeps its colour everywhere.
  const PHASES = ["A1-A3", "A4", "A5", "B", "C1", "C2", "C3", "C4"];
  function phaseTotals(lifecycle) {
    const t = {};
    lifecycle.forEach((s) => {
      if (s.carbon == null || !s.carbon) return;
      const k = PHASES.includes(s.module) ? s.module : "Other";
      t[k] = (t[k] || 0) + s.carbon;
    });
    return t;
  }

  // Status from the latest event: discarded or retired -> Retired; storage -> In storage.
  function statusOf(lifecycle, intake) {
    const ev = lifecycle.filter((s) => s.kind === "event");
    if (/retired/i.test(intake) || ev.some((s) => s.module === "C4" || /discard/i.test(s.what) || /retired/i.test(s.condition))) return "Retired";
    const last = ev[ev.length - 1];
    if (last && last.module === "STORAGE") return "In storage";
    return "In use";
  }
  const STATUSES = ["In use", "In storage", "Retired"];

  async function load() {
    // Each setting may be one CSV or a list of them (repo files + the Google Sheet).
    // A source that fails to load is skipped, so the site still works offline.
    const many = (list) => Promise.all([].concat(list).filter(Boolean).map((p, i) =>
      csv(p).catch((err) => {
        if (i === 0) throw err;
        console.warn("Could not load", p, err);
        return [];
      }))).then((parts) => parts.flat());
    // Rows are sorted by their columns, not by which list they came from, so a
    // Sheet link pasted in the wrong list still works.
    const all = (await Promise.all([many(CFG.materialsCsv), many(CFG.eventsCsv)])).flat();
    const evs = all.filter((r) => "en15978_module" in r);
    const allMats = all.filter((r) => !("en15978_module" in r));
    const seen = new Set();
    const mats = allMats.filter((m) => {
      const k = clean(m.material_id).toUpperCase();
      if (!k || !truthy(m.approved)) return true;
      if (seen.has(k)) { console.warn("Duplicate material ID, keeping the first:", k); return false; }
      seen.add(k);
      return true;
    });
    const byId = {};
    evs.filter((e) => truthy(e.approved) && clean(e.material_id)).forEach((e) => {
      const k = clean(e.material_id).toUpperCase();
      (byId[k] = byId[k] || []).push(e);
    });
    return mats
      .filter((m) => truthy(m.approved) && clean(m.material_id))
      .map((m) => buildMaterial(m, byId[clean(m.material_id).toUpperCase()] || []))
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  }

  // Small formatting helpers shared by the pages.
  const fmt = {
    mass: (kg) => (kg == null ? "—" : kg >= 1000 ? `${(kg / 1000).toLocaleString("en", { maximumFractionDigits: 2 })} <small>t</small>` : `${kg.toLocaleString("en", { maximumFractionDigits: 1 })} <small>kg</small>`),
    carbon: (v, digits = 2) => (v == null ? "—" : v.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: v < 10 ? Math.min(digits, 2) : 0 })),
    esc: (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  };

  // Show the first thumbnail that exists, or nothing.
  function thumb(img, list) {
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < list.length) img.src = list[i];
      else img.replaceWith(Object.assign(document.createElement("div"), { className: "thumb-empty", textContent: "No image yet" }));
    };
    img.src = list[0];
  }

  window.Bank = { load, fmt, thumb, url, MODULE_NAMES, PHASES, STATUSES, CFG, ROOT };
})();
