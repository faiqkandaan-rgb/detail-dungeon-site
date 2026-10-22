/* Detail Dungeon leads: website -> Google Sheet (+ an email when someone leaves a number).
   Standalone Apps Script project in the DD Google account, writing to the sheet below (SHEET_ID).
   Run setup() once, then Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
   Paste the web-app URL into index.html: DD_CFG.leads = "https://script.google.com/macros/s/.../exec" */

var SHEET_ID = "1-KBUWpH-BCuiZfqxOpWusQx0YeznvnDIvmG3ePPJcuw";   // the Detail Dungeon Leads sheet
var SHEET_NAME = "Leads";
var NOTIFY_EMAIL = "detaildungeonisb@gmail.com";   // emailed only when a lead leaves a phone number; "" = off
var HEADERS = ["Timestamp", "Name", "Phone", "WhatsApp", "Vehicle", "Class", "Coverage", "Film", "Price (Rs)",
               "Source", "Enquiry", "Status", "Assigned to", "Notes", "Next follow-up", "Page"];
var STATUSES = ["New", "Contacted", "Booked", "In bay", "Done", "Lost"];

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.getSheets()[0];
    if (sh.getLastRow() > 0) sh = ss.insertSheet(SHEET_NAME); else sh.setName(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { d = (e && e.parameter) || {}; }
  var phone = String(d.phone || "").replace(/\D/g, "");
  var wa = "";
  if (phone) wa = '=HYPERLINK("https://wa.me/' + (phone.charAt(0) === "0" ? "92" + phone.slice(1) : phone) + '","Open chat")';
  var source = d.source || "site";
  var enquiry = d.note || (source === "whatsapp-button" ? "Tapped Book on WhatsApp" : source === "callback-form" ? "Asked for a call back" : "");
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = sheet_();
    sh.appendRow([new Date(), d.name || "", phone ? "'" + phone : "", "", d.vehicle || "", d.cls || "", d.coverage || "",
                  d.film || "", d.price || "", source, enquiry, "New", "", "", "", d.page || ""]);
    if (wa) sh.getRange(sh.getLastRow(), 4).setFormula(wa);
  } finally { lock.releaseLock(); }
  if (NOTIFY_EMAIL && phone) {
    MailApp.sendEmail(NOTIFY_EMAIL, "New lead: " + (d.name || phone) + (d.vehicle ? ", " + d.vehicle : ""),
      (d.name || "Someone") + " left their number: " + phone + "\n" +
      [d.vehicle, d.coverage, d.film, d.price ? "Rs " + d.price : ""].filter(String).join(" · ") + "\n\n" +
      "WhatsApp: https://wa.me/" + (phone.charAt(0) === "0" ? "92" + phone.slice(1) : phone) + "\n" +
      "Sheet: " + ss_().getUrl());
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return ContentService.createTextOutput("Detail Dungeon leads endpoint is up."); }

/* Run once from the editor: names the file, builds the header, status dropdown, colours. */
function setup() {
  var ss = ss_();
  ss.rename("Detail Dungeon Leads");
  var sh = sheet_();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#111216").setFontColor("#ffffff");
  sh.getRange("L2:L2000").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  sh.getRange("O2:O2000").setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  sh.getRange("A2:A2000").setNumberFormat("dd mmm yyyy, h:mm am/pm");
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("New").setBackground("#fde2e3").setFontColor("#b0101a").setRanges([sh.getRange("L2:L2000")]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Booked").setBackground("#e3f5e6").setFontColor("#1d6b2f").setRanges([sh.getRange("L2:L2000")]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Lost").setFontColor("#9aa0a6").setRanges([sh.getRange("L2:L2000")]).build()
  ];
  sh.setConditionalFormatRules(rules);
  var widths = [150, 130, 120, 90, 150, 140, 90, 150, 90, 130, 260, 100, 110, 220, 120, 220];
  for (var i = 0; i < widths.length; i++) sh.setColumnWidth(i + 1, widths[i]);
}

/* Run from the editor to drop a test row in without the website. */
function testLead() {
  doPost({ postData: { contents: JSON.stringify({ source: "test", name: "Test lead (delete me)", phone: "03001234567",
    vehicle: "Toyota Corolla", cls: "Sedan", coverage: "Platinum", film: "OneFilm USA DefenX", price: 245000, page: "editor test" }) } });
}
