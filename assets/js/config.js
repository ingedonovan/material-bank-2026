/*
  MATERIAL BANK — SETTINGS
  This is the only file you should need to edit to point the site at new data.

  DATA
  Each setting below is a list of CSV files, read and combined in order:
    1. the repo's own files in /data (Pixelframe and other bulk imports)
    2. the Google Sheet's published tabs (what students submit through the Forms)
  To connect the Sheet: File > Share > Publish to web, choose the "Materials (bank)"
  tab and "Comma-separated values (.csv)", copy the link, paste it as the second
  item in materialsCsv. Do the same for "Events (bank)" in eventsCsv.
  If a material ID appears twice, the first one wins.
  (If the two Sheet links end up in the wrong lists, it still works: rows are sorted by their columns.)

  SCANS AND IMAGES
  Scans live in /models and images in /thumbs, named by material ID
  (e.g. models/PX-0001.glb, thumbs/PX-0001.png).
  If the scans ever move to another host, change MODELS_BASE only.
*/
window.BANK_CONFIG = {
  title: "Future Assemblies Material Bank",

  materialsCsv: [
    "data/materials.csv",
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLLGgPOxIJyS02tZOTojeZIxvgFDIiCW0AJLDDGjWLairP44_7CeJIV3px26zDGQKnTaa9uLqXv7Pr/pub?gid=732466315&single=true&output=csv",
  ],
  eventsCsv: [
    "data/events.csv",
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLLGgPOxIJyS02tZOTojeZIxvgFDIiCW0AJLDDGjWLairP44_7CeJIV3px26zDGQKnTaa9uLqXv7Pr/pub?gid=539114781&single=true&output=csv",
  ],

  modelsBase: "models/",
  thumbsBase: "thumbs/",
  thumbExtensions: ["jpg", "png"],

  // Map tiles: Esri "World Dark Gray Canvas", no labels. Free, no API key,
  // needs an internet connection. (CARTO tiles began requiring a key in Sept 2026.)
  tiles: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  tilesAttribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  tilesMaxZoom: 16,

  carbonUnit: "kgCO₂e",
};
