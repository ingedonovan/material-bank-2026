/**
 * MATERIAL BANK — Google Sheet + Forms setup
 *
 * What this does (once):
 *   1. Adds two tabs to this Sheet in exactly the format the website reads:
 *        "Materials (bank)" and "Events (bank)"
 *   2. Creates two Google Forms for students:
 *        "Material Bank — Register a material"
 *        "Material Bank — Log an event"
 *      (carbon questions only appear for A4, A5, C1 and C2 events)
 *   3. Copies every new form answer into the right bank tab, with the
 *      "approved" box unticked. Nothing appears on the website until you tick it.
 *   4. Writes the form links into a "Setup" tab.
 *
 * How to run it:
 *   In this Sheet: Extensions > Apps Script. Delete what is there, paste this
 *   whole file, click Save, choose the function "setup" at the top, click Run,
 *   and approve the permissions Google asks for (it needs to create forms and
 *   edit this Sheet). Run it once only.
 *
 * You can edit the lists just below before running (material types, tags).
 * After setup, edit the forms themselves in Google Forms if you want to reword
 * questions, but do not change the question titles:
 * the copying step finds answers by those titles.
 */

// ---- Lists you can edit before running ------------------------------------
var MATERIAL_TYPES = [
  'Precast concrete',
  'Cast-in-place concrete',
  'Steel',
  'Timber',
  'Masonry',
  'Glass',
  'Textile',
  'Plastic',
];
var TAGS = ['SUPERPERMANENCE', 'Pixelframe'];
var CONDITIONS = ['Good', 'Average', 'Poor'];

// Event types. carbon: true = the form asks for carbon for this type.
var EVENT_TYPES = [
  { code: 'A4', label: 'A4 · Transport to the site (delivery)', carbon: true },
  { code: 'A5', label: 'A5 · Construction / installation (incl. reconfiguring, cutting, grinding)', carbon: true },
  { code: 'B', label: 'B · In use', carbon: false },
  { code: 'C1', label: 'C1 · Deconstruction / recovery', carbon: true },
  { code: 'C2', label: 'C2 · Transport away after use (removal)', carbon: true },
  { code: 'C3', label: 'C3 · Waste processing', carbon: false },
  { code: 'C4', label: 'C4 · Disposal (discarded)', carbon: false },
  { code: 'Storage', label: 'Storage (between uses)', carbon: false },
];

// ---- Column layouts the website reads (do not change) ----------------------
var MAT_COLS = ['material_id', 'name', 'material_type', 'tags', 'mass_kg',
  'manufacture_date_status', 'manufacture_year', 'manufacture_month', 'manufacture_day',
  'manufacture_location_status', 'manufacture_place', 'manufacture_coordinates',
  'a1a3_kgco2e', 'carbon_working', 'condition_at_intake', 'condition_notes',
  'story', 'contributor', 'approved', 'submitted_at', 'check'];
var EVT_COLS = ['material_id', 'en15978_module', 'reconfiguration',
  'date_status', 'year', 'month', 'day',
  'location_status', 'place', 'coordinates',
  'what_happened', 'carbon_kgco2e', 'carbon_working', 'condition_after',
  'contributor', 'approved', 'submitted_at', 'check'];
var MAT_TAB = 'Materials (bank)';
var EVT_TAB = 'Events (bank)';

// Question titles (the copying step looks answers up by these)
var Q = {
  name: 'Your name',
  id: 'Material ID',
  matName: 'Short name for the material',
  type: 'Material type',
  tags: 'Tags',
  mass: 'Mass in kg',
  dateStatus: 'Is the date known?',
  year: 'Year',
  month: 'Month',
  day: 'Day',
  place: 'Place name',
  coords: 'Coordinates',
  a1a3: 'Embodied carbon A1–A3, in kgCO2e',
  carbon: 'Carbon for this event, in kgCO2e',
  working: 'Carbon working',
  condition: 'Condition',
  conditionNotes: 'Condition notes',
  story: 'Story',
  eventType: 'What kind of event?',
  reconf: 'Was the object changed and put to a new use (a reconfiguration)?',
  what: 'What happened?',
  conditionAfter: 'Condition after the event',
};

var ID_PATTERN = '^\\s*[A-Za-z]{2}-\\d{4}\\s*$';
var COORD_PATTERN = '^\\s*-?\\d{1,2}(\\.\\d+)?\\s*,\\s*-?\\d{1,3}(\\.\\d+)?\\s*$';
var MONTHS = ['1 · January', '2 · February', '3 · March', '4 · April', '5 · May', '6 · June',
  '7 · July', '8 · August', '9 · September', '10 · October', '11 · November', '12 · December'];

// ============================================================================
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(MAT_TAB) || ss.getSheetByName(EVT_TAB)) {
    throw new Error('Setup has already been run in this Sheet (the bank tabs exist). Nothing was changed.');
  }
  makeBankTab_(ss, MAT_TAB, MAT_COLS);
  makeBankTab_(ss, EVT_TAB, EVT_COLS);

  var reg = buildRegisterForm_();
  var log = buildEventForm_();
  reg.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  log.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();

  var setupTab = ss.getSheetByName('Setup') || ss.insertSheet('Setup', 0);
  setupTab.clear();
  setupTab.getRange(1, 1, 9, 2).setValues([
    ['Material Bank', ''],
    ['Student link: Register a material', reg.getPublishedUrl()],
    ['Student link: Log an event', log.getPublishedUrl()],
    ['Edit form: Register a material', reg.getEditUrl()],
    ['Edit form: Log an event', log.getEditUrl()],
    ['', ''],
    ['Next step', 'File > Share > Publish to web: publish "' + MAT_TAB + '" and "' + EVT_TAB + '" as CSV, and paste both links into assets/js/config.js.'],
    ['Approving', 'New answers appear in the bank tabs with "approved" unticked. Check the row (and the "check" column), fix typos directly in the cell, then tick approved.'],
    ['Do not rename', 'the bank tabs or their column headers.'],
  ]);
  setupTab.setColumnWidth(1, 260);
  setupTab.setColumnWidth(2, 700);
  setupTab.getRange('A1').setFontWeight('bold').setFontSize(14);
  SpreadsheetApp.getUi().alert('Done. The form links are in the "Setup" tab.');
}

function makeBankTab_(ss, name, cols) {
  var sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  var a = cols.indexOf('approved') + 1;
  sh.getRange(2, a, sh.getMaxRows() - 1, 1).insertCheckboxes();
  return sh;
}

// ---- Form 1: register a material -------------------------------------------
function buildRegisterForm_() {
  var f = FormApp.create('Material Bank — Register a material');
  f.setDescription('Register an object in the Material Bank, once per object. ' +
    'You need the ID printed on its tag. Leave anything you don\'t know blank: "unknown" is a real answer. ' +
    'Your entry appears on the website after it has been checked.');
  f.setCollectEmail(false);
  f.setProgressBar(true);

  f.addTextItem().setTitle(Q.name).setRequired(true);
  idItem_(f);
  f.addTextItem().setTitle(Q.matName).setHelpText('e.g. "Hollowcore slab, north bay" or "Blue steel pipe, bent".').setRequired(true);
  f.addMultipleChoiceItem().setTitle(Q.type).setChoiceValues(MATERIAL_TYPES).showOtherOption(true).setRequired(true);
  f.addCheckboxItem().setTitle(Q.tags).setChoiceValues(TAGS).showOtherOption(true).setRequired(true);
  f.addTextItem().setTitle(Q.mass).setHelpText('Weigh it, or estimate from its size and density. Write how you estimated it under Carbon working.')
    .setValidation(FormApp.createTextValidation().requireNumberGreaterThan(0).setHelpText('A number in kg, e.g. 12.5').build());

  f.addSectionHeaderItem().setTitle('Where and when was it made?')
    .setHelpText('Manufacture = A1–A3. If you don\'t know, choose Unknown and leave the rest blank.');
  dateItems_(f);
  placeItems_(f);

  f.addSectionHeaderItem().setTitle('Embodied carbon (A1–A3)');
  f.addTextItem().setTitle(Q.a1a3).setHelpText('The carbon from making it, for the whole object.')
    .setValidation(FormApp.createTextValidation().requireNumberGreaterThanOrEqualTo(0).setHelpText('A number in kgCO2e').build());
  f.addParagraphTextItem().setTitle(Q.working).setHelpText('Show your working: quantities, emission factors, and where each factor comes from.');

  f.addSectionHeaderItem().setTitle('Condition and story');
  f.addMultipleChoiceItem().setTitle(Q.condition).setChoiceValues(CONDITIONS).setRequired(true);
  f.addParagraphTextItem().setTitle(Q.conditionNotes).setHelpText('Cracks, chips, stains, missing parts…');
  f.addParagraphTextItem().setTitle(Q.story).setHelpText('What do you know about where it has been and what it has been part of?');
  return f;
}

// ---- Form 2: log an event --------------------------------------------------
function buildEventForm_() {
  var f = FormApp.create('Material Bank — Log an event');
  f.setDescription('Log something that happened to an object: a move, a reconfiguration, storage, recovery, disposal. ' +
    'One entry per event. Past events are welcome: use the date the event happened, not today\'s date.');
  f.setCollectEmail(false);
  f.setProgressBar(true);

  f.addTextItem().setTitle(Q.name).setRequired(true);
  idItem_(f);
  var typeItem = f.addMultipleChoiceItem().setTitle(Q.eventType).setRequired(true)
    .setHelpText('EN 15978 lifecycle modules. Moving it = A4 (to where it will be used) or C2 (away after use).');
  f.addMultipleChoiceItem().setTitle(Q.reconf).setChoiceValues(['Yes', 'No']).setRequired(true);

  var carbonPage = f.addPageBreakItem().setTitle('Carbon for this event')
    .setHelpText('Transport, construction and deconstruction carry carbon. Leave blank if it was negligible or unknown.');
  f.addTextItem().setTitle(Q.carbon)
    .setValidation(FormApp.createTextValidation().requireNumberGreaterThanOrEqualTo(0).setHelpText('A number in kgCO2e').build());
  f.addParagraphTextItem().setTitle(Q.working).setHelpText('e.g. "14 km by truck × 0.15 kgCO2e/tonne-km × 0.85 t" and the source of the factor.');

  var detailsPage = f.addPageBreakItem().setTitle('When and where');
  dateItems_(f);
  placeItems_(f);
  f.addParagraphTextItem().setTitle(Q.what).setRequired(true).setHelpText('One line, e.g. "Cut into two bench seats" or "Moved by van to CAST".');
  f.addMultipleChoiceItem().setTitle(Q.conditionAfter).setChoiceValues(CONDITIONS.concat(['Retired']))
    .setHelpText('Leave blank if unchanged.');

  typeItem.setChoices(EVENT_TYPES.map(function (t) {
    return typeItem.createChoice(t.label, t.carbon ? carbonPage : detailsPage);
  }));
  return f;
}

// ---- Shared questions ------------------------------------------------------
function idItem_(f) {
  f.addTextItem().setTitle(Q.id).setRequired(true)
    .setHelpText('The ID printed on the object\'s tag: two letters, a dash, four digits, e.g. SP-0014.')
    .setValidation(FormApp.createTextValidation().requireTextMatchesPattern(ID_PATTERN)
      .setHelpText('Format: two letters, dash, four digits, e.g. SP-0014').build());
}
function dateItems_(f) {
  f.addMultipleChoiceItem().setTitle(Q.dateStatus).setRequired(true)
    .setChoiceValues(['Known', 'Approximate', 'Unknown']);
  f.addTextItem().setTitle(Q.year)
    .setValidation(FormApp.createTextValidation().requireNumberBetween(1800, 2100).setHelpText('A year, e.g. 1978').build());
  f.addListItem().setTitle(Q.month).setChoiceValues(MONTHS).setHelpText('Optional');
  f.addTextItem().setTitle(Q.day).setHelpText('Optional')
    .setValidation(FormApp.createTextValidation().requireNumberBetween(1, 31).setHelpText('1 to 31').build());
}
function placeItems_(f) {
  f.addTextItem().setTitle(Q.place).setHelpText('e.g. "CAST, University of Manitoba" or "Arsenale, Venice". Leave blank if unknown.');
  f.addTextItem().setTitle(Q.coords)
    .setHelpText('In Google Maps, right-click the spot and click the numbers at the top to copy them, then paste here. Example: 49.8076, -97.1366')
    .setValidation(FormApp.createTextValidation().requireTextMatchesPattern(COORD_PATTERN)
      .setHelpText('Paste as "latitude, longitude", e.g. 49.8076, -97.1366').build());
}

// ============================================================================
// Runs on every form submission: copies the answer into the matching bank tab.
function onFormSubmit(e) {
  var v = e.namedValues || {};
  var get = function (title) { var a = v[title]; return a && a.length ? String(a[0]).trim() : ''; };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  var isEvent = (Q.eventType in v);
  var id = get(Q.id).toUpperCase();
  var dateStatus = get(Q.dateStatus) || 'Unknown';
  var month = (get(Q.month).match(/^\d+/) || [''])[0];
  var place = get(Q.place), coords = get(Q.coords);
  var locStatus = (place || coords) ? 'Known' : 'Unknown';
  var checks = [];
  if (dateStatus !== 'Unknown' && !get(Q.year)) checks.push('date marked ' + dateStatus + ' but no year');
  if (place && !coords) checks.push('place has no coordinates (will not show on the map)');

  var row, tab, cols;
  if (isEvent) {
    var label = get(Q.eventType);
    var type = EVENT_TYPES.filter(function (t) { return t.label === label; })[0];
    var code = type ? type.code : label.split(' ')[0];
    row = {
      material_id: id, en15978_module: code, reconfiguration: get(Q.reconf) || 'No',
      date_status: dateStatus, year: get(Q.year), month: month, day: get(Q.day),
      location_status: locStatus, place: place, coordinates: coords,
      what_happened: get(Q.what), carbon_kgco2e: get(Q.carbon), carbon_working: get(Q.working),
      condition_after: get(Q.conditionAfter), contributor: get(Q.name),
    };
    if (type && type.carbon && row.carbon_kgco2e && !row.carbon_working) checks.push('carbon given without working');
    tab = EVT_TAB; cols = EVT_COLS;
  } else {
    var tags = get(Q.tags).split(/\s*,\s*/).filter(String).join('; ');
    row = {
      material_id: id, name: get(Q.matName), material_type: get(Q.type), tags: tags, mass_kg: get(Q.mass),
      manufacture_date_status: dateStatus, manufacture_year: get(Q.year), manufacture_month: month, manufacture_day: get(Q.day),
      manufacture_location_status: locStatus, manufacture_place: place, manufacture_coordinates: coords,
      a1a3_kgco2e: get(Q.a1a3), carbon_working: get(Q.working),
      condition_at_intake: get(Q.condition), condition_notes: get(Q.conditionNotes),
      story: get(Q.story), contributor: get(Q.name),
    };
    var existing = ss.getSheetByName(MAT_TAB).getRange('A2:A').getValues().map(function (r) { return String(r[0]).toUpperCase(); });
    if (existing.indexOf(id) >= 0) checks.push('ID ' + id + ' is already registered');
    if (row.a1a3_kgco2e && !row.carbon_working) checks.push('A1–A3 given without working');
    tab = MAT_TAB; cols = MAT_COLS;
  }
  row.approved = false;
  row.submitted_at = now;
  row.check = checks.join('; ');

  var sh = ss.getSheetByName(tab);
  var r = sh.getLastRow() + 1;
  var colA = cols.indexOf('material_id') + 1;
  // find first empty row in column A (the checkbox column is pre-filled, so getLastRow is not reliable)
  var ids = sh.getRange(2, colA, sh.getMaxRows() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) { if (ids[i][0] === '') { r = i + 2; break; } }
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  sh.getRange(r, 1, 1, cols.length).setValues([cols.map(function (c) { return row[c] === undefined ? '' : row[c]; })]);
  sh.getRange(r, cols.indexOf('approved') + 1).insertCheckboxes().uncheck();
  if (row.check) sh.getRange(r, cols.indexOf('check') + 1).setBackground('#fff2cc');
}
