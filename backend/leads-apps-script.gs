/* Detail Dungeon leads: website -> Google Sheet (and an email ping).
   Lives inside the "Detail Dungeon Leads" Google Sheet: Extensions > Apps Script.
   Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
   Paste the web-app URL into index.html: DD_CFG.leads = "https://script.google.com/macros/s/.../exec" */

const SHEET_NAME   = "Leads";
const NOTIFY_EMAIL = "";          // e.g. "studio@detaildungeon.pk" to get an email per lead, empty = off
const HEADERS = ["Timestamp","Name","Phone","Vehicle","Class","Coverage","Film","Price (Rs)","Source","Status","Assigned to","Notes","Next follow-up","Page"];

function sheet_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); }
  return sh;
}

function doPost(e){
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { d = e.parameter || {}; }
  const sh = sheet_();
  sh.appendRow([
    new Date(), d.name || "", d.phone ? "'" + d.phone : "", d.vehicle || "", d.cls || "", d.coverage || "",
    d.film || "", d.price || "", d.source || "site", "New", "", "", "", d.page || ""
  ]);
  if (NOTIFY_EMAIL) {
    const who = d.name ? d.name + " (" + d.phone + ")" : "WhatsApp button, no number yet";
    MailApp.sendEmail(NOTIFY_EMAIL, "New lead: " + (d.vehicle || "website"),
      who + "\n" + [d.vehicle, d.coverage, d.film, d.price ? "Rs " + d.price : ""].filter(Boolean).join(" · ") + "\n\n" + (d.page || ""));
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(){ return ContentService.createTextOutput("Detail Dungeon leads endpoint is up."); }

/* Run once from the editor to add the Status dropdown and a Follow-ups view. */
function setup(){
  const sh = sheet_();
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(["New","Contacted","Booked","In bay","Done","Lost"], true).build();
  sh.getRange("J2:J1000").setDataValidation(rule);
  sh.getRange("M2:M1000").setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  sh.autoResizeColumns(1, HEADERS.length);
}
