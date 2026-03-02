/**
 * Michigan Central Dashboard — Google Apps Script
 *
 * Auto-syncs Google Form submissions to Supabase `applicants` table.
 *
 * SETUP:
 * 1. Open your Google Sheet linked to the form
 * 2. Extensions → Apps Script
 * 3. Paste this entire file into Code.gs (replace any existing code)
 * 4. Click the floppy disk icon to save
 * 5. Run `installTrigger` once (from the dropdown next to ▶, select installTrigger, then click ▶)
 *    - It will ask for permissions — approve them
 * 6. That's it! Every new form submission will auto-create an applicant in the dashboard.
 *
 * To test: Run `testWithLatestRow` to push the most recent spreadsheet row.
 */

var SUPABASE_URL = 'https://pwcmajuaphbgooxtauzp.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3Y21hanVhcGhiZ29veHRhdXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODUwNTEsImV4cCI6MjA4Njc2MTA1MX0.Iwtco5N4nCJYZGgxtZuQF_sn4aIOkeljIctlZ5ICZSE';

/**
 * Run this ONCE to set up the automatic trigger.
 */
function installTrigger() {
  // Remove any existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();
  Logger.log('Trigger installed successfully!');
}

/**
 * Fires automatically on every form submission.
 */
function onFormSubmit(e) {
  var row = e.values;
  if (!row || row.length < 3) return;
  var applicant = mapRowToApplicant(row);
  if (!applicant) return;
  insertToSupabase(applicant);
}

/**
 * Maps a spreadsheet row (array of values) to an applicant object.
 * Column B determines the tier, which determines which columns have data.
 */
function mapRowToApplicant(row) {
  // row[0] = Timestamp, row[1] = Membership Opportunities
  var tier = detectTier(row[1] || '');
  var applicant = { tier: tier, decision: 'Pending' };
  var details = {};

  // Parse timestamp as date_applied
  if (row[0]) {
    try {
      var d = new Date(row[0]);
      applicant.date_applied = d.toISOString().substring(0, 10);
    } catch (e) {
      applicant.date_applied = new Date().toISOString().substring(0, 10);
    }
  }

  if (tier === 'Originator') {
    // Columns C-T (indices 2-19)
    applicant.first_name = firstName(row[2]);
    applicant.last_name = lastName(row[2]);
    applicant.age = row[3] || null;
    applicant.email = row[4] || null;
    applicant.phone = row[5] || null;
    applicant.address = row[6] || null;
    applicant.city = row[7] || null;
    details.school_name = row[8] || '';
    details.website = row[9] || '';
    details.portfolio = row[10] || '';
    details.linkedin = row[11] || '';
    details.parent_name = row[12] || '';
    details.parent_email = row[13] || '';
    details.parent_phone = row[14] || '';
    applicant.interest_areas = row[15] || null;
    applicant.short_essay = row[16] || null;
    applicant.work_submission = row[17] || null;
    details.agrees_to_orientation = row[18] || '';
    details.confirms_info_accurate = row[19] || '';

  } else if (tier === 'Vanguard') {
    // Columns U-AK (indices 20-36)
    applicant.first_name = firstName(row[20]);
    applicant.last_name = lastName(row[20]);
    applicant.age = row[21] || null;
    applicant.email = row[22] || null;
    applicant.phone = row[23] || null;
    applicant.address = row[24] || null;
    applicant.city = row[25] || null;
    details.college_university = row[26] || '';
    details.occupation_focus = row[27] || '';
    details.website = row[28] || '';
    details.portfolio = row[29] || '';
    details.linkedin = row[30] || '';
    applicant.interest_areas = row[31] || null;
    applicant.short_essay = row[32] || null;
    details.how_use_space = row[33] || '';
    details.how_often_work = row[34] || '';
    details.how_often_use_space = row[35] || '';
    applicant.work_submission = row[36] || null;

  } else if (tier === 'Ponyride') {
    // Columns AL-BJ (indices 37-61)
    applicant.first_name = firstName(row[37]);
    applicant.last_name = lastName(row[37]);
    applicant.age = row[38] || null;
    applicant.email = row[39] || null;
    applicant.phone = row[40] || null;
    applicant.address = row[41] || null;
    applicant.city = row[42] || null;
    details.company = row[43] || '';
    details.business_description = row[44] || '';
    details.business_website = row[45] || '';
    details.social_media = row[46] || '';
    details.job_title = row[47] || '';
    details.personal_website = row[48] || '';
    details.linkedin = row[49] || '';
    details.portfolio = row[50] || '';
    applicant.interest_areas = row[51] || null;
    applicant.short_essay = row[52] || null;
    details.how_use_space = row[53] || '';
    details.how_often_work = row[54] || '';
    details.how_often_use_space = row[55] || '';
    details.mentorship_youth = row[56] || '';
    applicant.work_submission = row[57] || null;
    details.agrees_to_orientation = row[58] || '';
    details.confirms_info_accurate = row[59] || '';
    details.confirms_info_true = row[60] || '';
    details.agrees_to_standards = row[61] || '';
  }

  if (!applicant.first_name && !applicant.last_name) return null;

  // Clean empty strings from details
  var cleanDetails = {};
  for (var key in details) {
    if (details[key]) cleanDetails[key] = details[key];
  }
  if (Object.keys(cleanDetails).length > 0) {
    applicant.details = cleanDetails;
  }

  return applicant;
}

/**
 * Detects tier from the "Membership Opportunities" answer.
 */
function detectTier(value) {
  var v = value.toLowerCase();
  if (v.indexOf('ponyride') >= 0) return 'Ponyride';
  if (v.indexOf('vanguard') >= 0) return 'Vanguard';
  if (v.indexOf('originator') >= 0) return 'Originator';
  // Fallback heuristics
  if (v.indexOf('youth') >= 0 || v.indexOf('14') >= 0) return 'Originator';
  if (v.indexOf('business') >= 0 || v.indexOf('entrepreneur') >= 0) return 'Ponyride';
  return 'Vanguard'; // default
}

function firstName(fullName) {
  if (!fullName) return '';
  var parts = fullName.trim().split(/\s+/);
  return parts[0] || '';
}

function lastName(fullName) {
  if (!fullName) return '';
  var parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}

/**
 * Inserts an applicant row into Supabase via REST API.
 * Checks for existing email first to prevent duplicates.
 */
function insertToSupabase(applicant) {
  // Duplicate check by email
  if (applicant.email) {
    var checkUrl = SUPABASE_URL + '/rest/v1/applicants?email=eq.' + encodeURIComponent(applicant.email) + '&select=id&limit=1';
    var checkResp = UrlFetchApp.fetch(checkUrl, {
      method: 'get',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      muteHttpExceptions: true
    });
    if (checkResp.getResponseCode() === 200) {
      var existing = JSON.parse(checkResp.getContentText());
      if (existing.length > 0) {
        Logger.log('SKIP (duplicate): ' + applicant.first_name + ' ' + applicant.last_name + ' — ' + applicant.email);
        return false;
      }
    }
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(applicant),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/applicants', options);
  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('SUCCESS: Inserted ' + applicant.first_name + ' ' + applicant.last_name + ' (' + applicant.tier + ')');
    return true;
  } else {
    Logger.log('ERROR ' + code + ': ' + response.getContentText());
    return false;
  }
}

/**
 * Test function — pushes the most recent row from the spreadsheet.
 * Run this manually to verify everything works.
 */
function testWithLatestRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  var row = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = row.map(function(v) { return v ? v.toString() : ''; });
  var applicant = mapRowToApplicant(values);
  if (!applicant) {
    Logger.log('Could not map row to applicant');
    return;
  }
  Logger.log('Mapped applicant: ' + JSON.stringify(applicant));
  insertToSupabase(applicant);
}

/**
 * BACKFILL — Run this once to import all existing form responses
 * that aren't already in the dashboard.
 *
 * Compares by email address to avoid duplicates.
 * Check the Logs (View → Logs) after running to see results.
 */
function backfillMissing() {
  // 1. Fetch all existing emails from Supabase
  var existing = fetchExistingEmails();
  Logger.log('Found ' + existing.size + ' existing applicants in dashboard');

  // 2. Read all rows from the sheet
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('No data rows found'); return; }
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var inserted = 0, skipped = 0, errors = 0;

  for (var i = 0; i < data.length; i++) {
    var values = data[i].map(function(v) { return v ? v.toString() : ''; });
    var applicant = mapRowToApplicant(values);
    if (!applicant) { skipped++; continue; }

    // Check if this email already exists in the dashboard
    var email = (applicant.email || '').toLowerCase().trim();
    if (email && existing.has(email)) {
      Logger.log('SKIP (exists): ' + applicant.first_name + ' ' + applicant.last_name + ' — ' + email);
      skipped++;
      continue;
    }

    // Insert
    var success = insertToSupabase(applicant);
    if (success !== false) {
      inserted++;
      if (email) existing.add(email); // track so we don't double-insert within this run
    } else {
      errors++;
    }

    // Apps Script has a 6-min limit — pace requests slightly
    if (i % 20 === 0 && i > 0) Utilities.sleep(500);
  }

  Logger.log('=== BACKFILL COMPLETE ===');
  Logger.log('Inserted: ' + inserted);
  Logger.log('Skipped (already exists or no name): ' + skipped);
  Logger.log('Errors: ' + errors);
}

/**
 * Fetches all existing applicant emails from Supabase.
 */
function fetchExistingEmails() {
  var emails = new Set();
  var url = SUPABASE_URL + '/rest/v1/applicants?select=email';
  var options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    var rows = JSON.parse(response.getContentText());
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].email) emails.add(rows[i].email.toLowerCase().trim());
    }
  }
  return emails;
}
