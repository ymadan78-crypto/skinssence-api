const db = require('../backend/db');
const fs = require('fs');
const path = require('path');

console.log('--- INVESTIGATING LEGACY PATIENT DATABASE & S1601 / SHREYA SHORYA ---');

// 1. List all tables in Turso DB
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  console.log('\n1. ALL TABLES IN TURSO DB:', tables);

  // 2. Search for Shreya or 1601 in patients table
  db.all("SELECT * FROM patients WHERE skinssence_id LIKE '%1601%' OR first_name LIKE '%Shreya%' OR last_name LIKE '%Shorya%'", [], (errP, pRows) => {
    console.log('\n2. SEARCH IN `patients` TABLE:', pRows);
  });

  // 3. Count total patients in `patients` table
  db.get("SELECT COUNT(*) as total_patients, MIN(skinssence_id) as min_id, MAX(skinssence_id) as max_id FROM patients", [], (errC, cRow) => {
    console.log('\n3. TOTAL PATIENTS IN `patients` TABLE:', cRow);
  });

  // 4. Sample patients with lowest skinssence_ids and highest skinssence_ids
  db.all("SELECT id, skinssence_id, first_name, last_name, mobile, created_at FROM patients ORDER BY CAST(SUBSTR(skinssence_id, 2) AS INTEGER) ASC LIMIT 10", [], (errLow, lowRows) => {
    console.log('\n4. LOWEST S-NUMBERS IN DB:', lowRows);
  });

  db.all("SELECT id, skinssence_id, first_name, last_name, mobile, created_at FROM patients ORDER BY CAST(SUBSTR(skinssence_id, 2) AS INTEGER) DESC LIMIT 10", [], (errHigh, highRows) => {
    console.log('\n5. HIGHEST S-NUMBERS IN DB:', highRows);
  });
});
