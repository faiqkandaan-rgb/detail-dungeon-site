Leads: website -> WhatsApp + Google Sheet
=========================================

What the site does now
  - Every "Book this on WhatsApp" tap opens WhatsApp to the studio number with
    the quote prefilled (car, coverage, film, price). The number is one line in
    index.html: DD_CFG.whatsapp.
  - The "leave a number" form under the quote posts name, number and the quote
    to the Leads sheet. If the sheet endpoint is not set up yet, it falls back
    to opening WhatsApp with the same details, so nothing is lost either way.
  - WhatsApp taps are logged to the sheet too (source = whatsapp-button), so the
    studio sees interest even when nobody fills the form.

Set up the sheet (10 minutes, once)
  1. Open the Google Sheet "Detail Dungeon Leads" (created in Faiq's Drive) or
     make a new one with the same headers as leads-apps-script.gs.
  2. Extensions > Apps Script. Delete what is there, paste leads-apps-script.gs.
     Optional: put the studio email in NOTIFY_EMAIL for an email per lead.
  3. Run "setup" once from the toolbar (adds the Status dropdown). Approve the
     permissions it asks for.
  4. Deploy > New deployment > type Web app > Execute as: Me, Who has access:
     Anyone > Deploy. Copy the web-app URL (ends in /exec).
  5. In index.html find   const DD_CFG = { whatsapp: "923260167777", leads: "" }
     and paste the URL into leads. Upload the site again.
  6. Test: submit the form on the site, a row appears within a second.

Working the leads (staff)
  - One row per lead. Status: New > Contacted > Booked > In bay > Done, or Lost.
  - Phone is stored as text with the leading 0. Tap it on a phone to call, or
    put =HYPERLINK("https://wa.me/92"&MID(C2,2,20),"WhatsApp") in a spare column
    for a one-tap WhatsApp link per row.
  - Staff can add walk-in or phone leads by typing a row; Source = "walk-in".
  - File > Download > Microsoft Excel whenever an .xlsx is needed. Or use
    Google Sheets' own sharing so everyone works on the live copy.

If the studio insists on Excel Online instead of Google Sheets
  Same site code, different endpoint: in Power Automate make a flow
  "When an HTTP request is received" (JSON body with the same field names)
  > "Add a row into a table" (an Excel file on OneDrive/SharePoint with a
  table named Leads). Paste the flow's HTTP URL into DD_CFG.leads.

Later, if they want automatic WhatsApp replies
  That needs WhatsApp Business API (Meta Cloud API, or Twilio/Wati/360dialog),
  a verified business, and a small server. The sheet endpoint is the right
  place to trigger it: the Apps Script doPost can call the API after it writes
  the row. Not needed for launch.
