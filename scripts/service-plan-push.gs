/**
 * SSM Work · Service Plan — push the sheet "ใบร้องขอคนจากฝ่ายผลิต" (tab ใบขอคน 2026) to ssmwork.vercel.app.
 * Free: runs on Google Apps Script with your own Google account. No Google Cloud project needed.
 *
 * Whenever anyone adds or edits a row, the "On change" trigger sends columns A–Q of every row to
 * POST https://ssmwork.vercel.app/api/service-plan/sync (header x-ssm-token). A 15-minute timer is a safety net.
 *
 * Setup (once):
 *  1. script.google.com → New project → delete the sample code → paste this file → Save (name: SSM Service Plan push).
 *  2. ⚙ Project Settings → Script Properties → Add property: TOKEN = the same value as SERVICE_PLAN_TOKEN in Vercel.
 *  3. Back in Editor → choose function "setup" → Run → allow the permissions (your account) .
 *     setup() creates the triggers and sends the first push. Check "Execution log": "pushed 360 rows → 200".
 *  Next year: add Script Property SHEET_GID = gid of tab "ใบขอคน 2027", then run setup() again.
 */
const SPREADSHEET_ID = '1jubBroZnav3iWEVN74yMM1A5OKmsvZkmIUxpWWvnPmQ';
const DEFAULT_GID = 384071614;  // ใบขอคน 2026
const FIRST_ROW = 6;            // data starts under the 5 header rows
const LAST_COL = 17;            // A..Q (Q = Finish)
const SYNC_URL = 'https://ssmwork.vercel.app/api/service-plan/sync';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('push').forSpreadsheet(SPREADSHEET_ID).onChange().create();   // new rows, edits, deletes
  ScriptApp.newTrigger('push').timeBased().everyMinutes(15).create();                // safety net
  push();
}

function push() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('TOKEN');
    if (!token || token.length < 16) throw new Error('Set Script Property TOKEN (same as SERVICE_PLAN_TOKEN in Vercel)');
    const gid = Number(props.getProperty('SHEET_GID') || DEFAULT_GID);
    const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().find(function (s) { return s.getSheetId() === gid; });
    if (!sh) throw new Error('Sheet gid ' + gid + ' not found');
    const last = sh.getLastRow();
    const vals = last >= FIRST_ROW ? sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, LAST_COL).getDisplayValues() : [];
    const rows = [];
    vals.forEach(function (v, i) { if (v[3] || v[4]) rows.push({ n: FIRST_ROW + i, v: v }); });
    const res = UrlFetchApp.fetch(SYNC_URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-ssm-token': token },
      payload: JSON.stringify({ sheet: sh.getName(), gid: gid, rows: rows }),
    });
    console.log('pushed ' + rows.length + ' rows → ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  } finally {
    lock.releaseLock();
  }
}
