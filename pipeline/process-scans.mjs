/*
  Scan processing, run by GitHub after anyone adds a file to /models.
  (See .github/workflows/process-scans.yml. You can also run it on your own
  computer with:  node pipeline/process-scans.mjs)

  For every .glb in /models it:
    1. renames it to the material ID, e.g. "px_83 scan.glb" -> "PX-0083.glb"
    2. shrinks it to MAX_MB (default 5) by resizing textures, then simplifying the mesh if needed
    3. renders a thumbnail into /thumbs if there isn't one yet
  Files it can't match to an ID are left alone and listed in the log.
*/
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MODELS = path.join(ROOT, "models");
const THUMBS = path.join(ROOT, "thumbs");
const MAX_MB = Number(process.env.MAX_MB || 5);
const BIN = path.join(ROOT, "node_modules", ".bin", "gltf-transform");
const mb = (f) => fs.statSync(f).size / 1e6;
const log = (...a) => console.log("[scans]", ...a);

// "px_83 scan.glb", "SP 14.glb", "sp-0014.GLB" -> "PX-0083" / "SP-0014"
function idFromName(name) {
  const m = path.basename(name, path.extname(name)).match(/(?:^|[^A-Za-z])([A-Za-z]{2})[\s_-]*0*(\d{1,4})(?!\d)/);
  return m ? `${m[1].toUpperCase()}-${m[2].padStart(4, "0")}` : null;
}

function gt(...args) { execFileSync(BIN, args, { stdio: "pipe" }); }

function shrink(file) {
  if (mb(file) <= MAX_MB) return;
  const tmp = file + ".tmp.glb";
  const steps = [
    ["resize", "--width", "2048", "--height", "2048"],
    ["resize", "--width", "1024", "--height", "1024"],
    ["weld"],
    ["simplify", "--ratio", "0.5", "--error", "0.001"],
    ["simplify", "--ratio", "0.25", "--error", "0.002"],
  ];
  for (const s of steps) {
    if (mb(file) <= MAX_MB) break;
    const before = mb(file);
    gt(s[0], file, tmp, ...s.slice(1));
    fs.renameSync(tmp, file);
    log(`  ${s.join(" ")}: ${before.toFixed(1)} MB -> ${mb(file).toFixed(1)} MB`);
  }
  if (mb(file) > MAX_MB) log(`  WARNING still ${mb(file).toFixed(1)} MB after all steps; check this scan by hand`);
}

// Tiny static server so the headless browser can load the viewer and the scan.
function serve() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg" };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (req.url.startsWith("/__thumb.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<!doctype html><body style="margin:0;background:transparent">
        <script type="module" src="/assets/vendor/model-viewer.min.js"></script>
        <model-viewer id="mv" style="width:600px;height:600px;background:transparent;--progress-bar-height:0px"
          camera-orbit="35deg 70deg auto" exposure="1.05" shadow-intensity="0.6" interaction-prompt="none"></model-viewer></body>`);
    }
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, () => ok(srv)));
}

async function thumbnails(ids) {
  if (!ids.length) return;
  const { chromium } = await import("playwright");
  const sharp = (await import("sharp")).default;
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await page.goto(`http://localhost:${port}/__thumb.html`);
  for (const id of ids) {
    try {
      await page.evaluate((src) => new Promise((ok, fail) => {
        const m = document.getElementById("mv");
        m.addEventListener("load", () => setTimeout(ok, 800), { once: true });
        m.addEventListener("error", () => fail(new Error("could not load")), { once: true });
        m.src = src;
      }), `/models/${id}.glb`);
      const png = await page.locator("#mv").screenshot({ omitBackground: true });
      const { data: trimmed, info } = await sharp(png).trim().png().toBuffer({ resolveWithObject: true });
      const { width, height } = info;
      const s = Math.max(width, height);
      const square = await sharp({ create: { width: s, height: s, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: trimmed, left: Math.round((s - width) / 2), top: Math.round((s - height) / 2) }])
        .png().toBuffer();
      await sharp(square).resize(400, 400).png({ compressionLevel: 9 }).toFile(path.join(THUMBS, `${id}.png`));
      log(`  thumbnail: thumbs/${id}.png`);
    } catch (err) {
      log(`  WARNING no thumbnail for ${id}: ${err.message}`);
    }
  }
  await browser.close();
  srv.close();
}

async function main() {
  fs.mkdirSync(THUMBS, { recursive: true });
  const needThumb = [];
  // Scans changed in this upload get a fresh thumbnail even if one exists (set by the GitHub workflow).
  const changed = new Set((process.env.CHANGED || "").split("\n").map((f) => idFromName(f)).filter(Boolean));
  const unmatched = [];
  for (const name of fs.readdirSync(MODELS)) {
    if (path.extname(name).toLowerCase() !== ".glb") continue;
    const id = idFromName(name);
    if (!id) { unmatched.push(name); continue; }
    let file = path.join(MODELS, name);
    const target = path.join(MODELS, `${id}.glb`);
    if (file !== target) {
      if (fs.existsSync(target)) log(`${name}: replaces the existing ${id}.glb`);
      fs.renameSync(file, target);
      log(`${name} -> ${id}.glb`);
      file = target;
      for (const x of ["png", "jpg"]) fs.rmSync(path.join(THUMBS, `${id}.${x}`), { force: true }); // new scan, new thumbnail
    }
    if (mb(file) > MAX_MB) { log(`${id}.glb is ${mb(file).toFixed(1)} MB, shrinking`); shrink(file); }
    if (changed.has(id) || !["png", "jpg"].some((x) => fs.existsSync(path.join(THUMBS, `${id}.${x}`)))) needThumb.push(id);
  }
  await thumbnails(needThumb);
  if (unmatched.length) log(`No material ID in these file names, left as they are: ${unmatched.join(", ")}`);
  log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
