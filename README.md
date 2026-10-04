# Future Assemblies Material Bank

A digital material bank: each material has a page with its 3D scan, where it has been, and the carbon attributed to it over its lifecycle. The site is plain HTML, CSS and JavaScript with no build step. It runs on GitHub Pages at no cost.

## What's where

| Folder / file | What it is | Edit it? |
|---|---|---|
| `data/materials.csv` | One row per material | Yes (until the Google Sheet is connected) |
| `data/events.csv` | One row per event in a material's life | Yes (until the Google Sheet is connected) |
| `models/` | 3D scans, named by ID: `PX-0001.glb` | Add files |
| `thumbs/` | One image per material, named by ID: `PX-0001.jpg` or `.png` | Add files |
| `assets/js/config.js` | Settings: where the data and scans come from | Rarely |
| `index.html` | Home page | No |
| `m/index.html` | Material page template: `m/?id=PX-0001` | No |
| `assets/` | Styles, scripts and bundled libraries | No |

Materials and events only appear on the site when `approved` is `TRUE`.

## Preview the site on your computer (VS Code)

The pages load data files, so they have to be served. Double-clicking `index.html` will not work.

1. In VS Code, install the extension **Live Preview** (by Microsoft, id `ms-vscode.live-server`). This only needs doing once.
2. Open this folder in VS Code.
3. Right-click `index.html` and choose **Show Preview**. To open it in your normal browser instead, open the Command Palette (Ctrl+Shift+P), run **Live Preview: Start Server**, and go to the address it shows (usually `http://127.0.0.1:3000/`).

Note: the older **Live Server** extension by Ritwick Dey has been removed from the VS Code Marketplace. Don't use it.

## Publish to the web (first time)

1. In VS Code, open **Source Control** (the branch icon on the left).
2. Click **Publish to GitHub**, choose a **public** repository, and name it `material-bank-2026`.
3. On github.com, open the repository, then go to **Settings → Pages**.
4. Under *Build and deployment*, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and click **Save**.
5. After a minute the site is live at `https://<your-username>.github.io/material-bank-2026/`.

After that, every **Commit** and **Sync** in VS Code updates the live site within a minute or two.

## Add a material by hand

1. Add a row to `data/materials.csv` and rows to `data/events.csv`. You can edit both in Excel, but save them as CSV UTF-8.
2. Put the scan in `models/` and an image in `thumbs/`, named with the material ID.
3. Commit and sync.

Keep scans at **5 MB or less**. Compress them before adding them.

## Student pipeline

Students never touch this folder. They use two Google Forms for data and upload scans to GitHub; everything else is automatic.

```
Google Form ──> Google Sheet ("bank" tabs, you tick Approved) ──> published CSV ──┐
                                                                                   ├──> website
Scan (.glb) ──> GitHub /models ──> GitHub Action: rename, shrink, thumbnail ───────┘
```

### One-time setup: Google Sheet and Forms (about 10 minutes)

1. Create an empty Google Sheet, e.g. "Material Bank data".
2. **Extensions → Apps Script.** Delete what's there, paste the whole of `pipeline/google-sheet-setup.gs`, click **Save**.
3. Choose `setup` in the function menu at the top, click **Run**, and approve the permissions. Google warns that the app is unverified; that's normal for your own script: **Advanced → Go to project**.
4. The Sheet now has a **Setup** tab with the two student links, plus the bank tabs **Materials (bank)** and **Events (bank)**.
5. **File → Share → Publish to web.** Publish **Materials (bank)** as **Comma-separated values (.csv)** and copy the link. Do the same for **Events (bank)**.
6. Paste both links into `assets/js/config.js` (there are placeholders), then commit and sync.

To edit the material-type list or tags before running: they're at the top of the script. After setup you can reword help text in Google Forms, but don't change question titles.

### Approving entries

New submissions appear in the bank tabs with **approved** unticked, and a yellow **check** note if something looks off (duplicate ID, carbon without working, place without coordinates). Fix typos directly in the cell, then tick **approved**. The site picks it up within about 5 minutes, which is Google's publishing delay.

### One-time setup: scan processing on GitHub

After the repo is on GitHub, the workflow in `.github/workflows/process-scans.yml` runs whenever something is added to `models/`:
- renames scans to their ID (`sp_14 scan.glb` → `SP-0014.glb`)
- shrinks anything over 5 MB
- renders a thumbnail into `thumbs/`
- saves the results back to the repo

Watch it under the repo's **Actions** tab. If it can't save, go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.

Students need a GitHub account and to be added under **Settings → Collaborators** to upload. Alternatively, collect scans in a shared folder and upload them yourself.

### Student steps

1. Stick the tag on the object and note its ID (e.g. SP-0014).
2. Scan it in Polycam and export **GLB**. The GitHub website only accepts uploads under **25 MB**, so export at medium quality if needed.
3. On GitHub, open `models/` → **Add file → Upload files**, drop the .glb in, **Commit**. The file name just needs to contain the ID.
4. Fill in **Register a material** once. Fill in **Log an event** for each thing that happened to it, past events included.

## Data fields

**materials.csv:**
- `material_id`, `name`, `material_type`, `tags`, `mass_kg` (one or more, separated by `;`, e.g. `Pixelframe; SUPERPERMANENCE`)
- `manufacture_date_status` (Known / Approximate / Unknown), `manufacture_year`, `manufacture_month`, `manufacture_day`
- `manufacture_location_status` (Known / Unknown), `manufacture_place`, `manufacture_coordinates` (`lat, lon`)
- `a1a3_kgco2e`, `carbon_working`
- `condition_at_intake`, `condition_notes`
- `story`, `contributor`, `approved`

**events.csv:**
- `material_id`, `en15978_module` (A4, A5, B, C1, C2, C3, C4, or Storage), `reconfiguration` (Yes / No)
- `date_status`, `year`, `month`, `day`
- `location_status`, `place`, `coordinates`
- `what_happened`, `carbon_kgco2e`, `carbon_working`, `condition_after`
- `contributor`, `approved`

`events.csv` also has `old_reconfiguration_number`, a link back to the Pixelframe library's assemblies. The site ignores it.

The site works these out itself: each material's status (In use, In storage, or Retired, from its latest events), the number of reconfigurations (events marked Yes), cumulative carbon (A1–A3 plus every event's carbon, in date order), current condition and current location.

## Carbon accounting

A1–A3 is attributed to a material's first life and entered once. Later lives add only transport (A4, C2), construction (A5) and deconstruction (C1) emissions. Module D is not yet included.

## Libraries (bundled in `assets/vendor/`, so the site works without CDNs)

- [model-viewer](https://modelviewer.dev) 4.3 (Apache-2.0)
- [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2)
- [PapaParse](https://www.papaparse.com) 5 (MIT)
- IBM Plex Sans and Plex Mono (SIL OFL)

Map tiles come from Esri (World Light Gray Canvas), need no API key, and need an internet connection. They can be swapped in `assets/js/config.js`.
