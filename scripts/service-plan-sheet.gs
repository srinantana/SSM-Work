/**
 * SSM Work · Service Plan — read-only relay for the sheet "ใบร้องขอคนจากฝ่ายผลิต" (tab "ใบขอคน 2026").
 * The sheet is shared only with RAK accounts, so ssmwork.vercel.app cannot read it directly.
 * This web app runs as the person who deploys it and returns columns A–Q of every data row as JSON,
 * only when the caller sends the secret token. Filtering (IS/SO/IN/WR + New/Checking/Confirm/Complete) is done by SSM Work.
 *
 * Setup (once):
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings → Script Properties → add TOKEN = a long random string (at least 16 characters).
 *     Optional: SHEET_GID = gid of another tab (e.g. next year's "ใบขอคน 2027"); default is 384071614 ("ใบขอคน 2026").
 *  3. Deploy → New deployment → type "Web app" · Execute as: Me · Who has access: Anyone → Deploy → copy the /exec URL.
 *  4. Vercel → project ssmwork → Settings → Environment Variables:
 *       SERVICE_PLAN_SHEET_URL = the /exec URL
 *       SERVICE_PLAN_TOKEN     = the same TOKEN
 *     then redeploy. Without these the Service Plan page shows the snapshot saved in hub/service-plan/data/snapshot.json.
 */
const SPREADSHEET_ID = '1jubBroZnav3iWEVN74yMM1A5OKmsvZkmIUxpWWvnPmQ';
const DEFAULT_GID = 384071614; // ใบขอคน 2026
const FIRST_ROW = 6;           // data starts under the 5 header rows
const LAST_COL = 17;           // A..Q (Q = Finish)

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TOKEN');
  if (!token || token.length < 16 || !e || !e.parameter || e.parameter.token !== token) return out_({ error: 'forbidden' });
  const gid = Number(props.getProperty('SHEET_GID') || DEFAULT_GID);
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().find(function (s) { return s.getSheetId() === gid; });
  if (!sh) return out_({ error: 'sheet not found' });
  const last = sh.getLastRow();
  const vals = last >= FIRST_ROW ? sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, LAST_COL).getDisplayValues() : [];
  const rows = [];
  vals.forEach(function (v, i) { if (v[3] || v[4]) rows.push({ n: FIRST_ROW + i, v: v }); });
  return out_({ updated: new Date().toISOString(), sheet: sh.getName(), gid: gid, rows: rows });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
