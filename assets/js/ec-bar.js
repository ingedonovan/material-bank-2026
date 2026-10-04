/*
  Embodied carbon split by lifecycle phase, as one horizontal bar.
  Each phase has a fixed colour (set in style.css as --ph-A1-A3 etc.), so a
  phase looks the same on every page. The legend below doubles as the table view.
*/
(function () {
  function render(container, phases, opts = {}) {
    const { fmt, MODULE_NAMES, PHASES, CFG } = window.Bank;
    const keys = PHASES.concat(["Other"]).filter((k) => phases[k] > 0);
    const total = keys.reduce((a, k) => a + phases[k], 0);
    if (!total) {
      container.innerHTML = `<p class="empty">No carbon recorded yet.</p>`;
      return;
    }
    const pct = (v) => (v / total) * 100;
    const pctLabel = (v) => {
      const p = pct(v);
      return p >= 10 ? Math.round(p) + "%" : p >= 1 ? p.toFixed(1) + "%" : "<1%";
    };
    const name = (k) => (k === "Other" ? "Other" : MODULE_NAMES[k] || k);
    const cls = (k) => "ph-" + k.replace(/[^A-Za-z0-9]/g, "");

    container.innerHTML = `
      <div class="ecbar-wrap">
        <div class="ecbar" role="img" aria-label="${fmt.esc(opts.label || "Carbon by lifecycle phase")}: ${keys.map((k) => `${k} ${pctLabel(phases[k])}`).join(", ")}">
          ${keys.map((k) => `<div class="ecbar-seg ${cls(k)}" style="flex-grow:${phases[k]}" data-k="${k}" tabindex="0">
              ${pct(phases[k]) >= 9 ? `<span>${k === "A1-A3" ? "A1–A3" : k}</span>` : ""}
            </div>`).join("")}
        </div>
        <div class="tooltip" hidden></div>
      </div>
      <table class="ecbar-legend">
        <tbody>
          ${keys.map((k) => `<tr>
            <td><span class="swatch ${cls(k)}"></span>${k === "A1-A3" ? "A1–A3" : fmt.esc(k)}</td>
            <td class="muted">${fmt.esc(name(k))}</td>
            <td class="num">${fmt.carbon(phases[k])}</td>
            <td class="num muted">${pctLabel(phases[k])}</td>
          </tr>`).join("")}
          <tr class="total"><td>Total</td><td></td><td class="num">${fmt.carbon(total)}</td><td class="num muted">${CFG.carbonUnit}</td></tr>
        </tbody>
      </table>`;

    const wrap = container.querySelector(".ecbar-wrap");
    const tip = container.querySelector(".tooltip");
    container.querySelectorAll(".ecbar-seg").forEach((seg) => {
      const k = seg.dataset.k;
      const show = () => {
        tip.innerHTML = `<strong>${k === "A1-A3" ? "A1–A3" : fmt.esc(k)} · ${fmt.esc(name(k))}</strong><span>${fmt.carbon(phases[k])} ${CFG.carbonUnit} · ${pctLabel(phases[k])} of total</span>`;
        tip.hidden = false;
        const r = seg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(r.left - w.left + r.width / 2 - 100, w.width - 220)) + "px";
        tip.style.top = "-6px";
      };
      seg.addEventListener("mouseenter", show);
      seg.addEventListener("focus", show);
      seg.addEventListener("click", show);
      seg.addEventListener("mouseleave", () => (tip.hidden = true));
      seg.addEventListener("blur", () => (tip.hidden = true));
    });
  }
  window.ECBar = { render };
})();
