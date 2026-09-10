const db = require('../backend/db');

console.log('Inspecting Tables Schema & Data...');

db.serialize(() => {
  db.all("PRAGMA table_info(procedures)", (err, rows) => {
    console.log('--- PROCEDURES SCHEMA ---', rows);
  });
  db.all("PRAGMA table_info(medicines)", (err, rows) => {
    console.log('--- MEDICINES SCHEMA ---', rows);
  });
  db.all("PRAGMA table_info(visits)", (err, rows) => {
    console.log('--- VISITS SCHEMA ---', rows);
  });
  db.all("PRAGMA table_info(payments)", (err, rows) => {
    console.log('--- PAYMENTS SCHEMA ---', rows);
  });

  db.all("SELECT p.*, v.visit_date FROM procedures p JOIN visits v ON p.visit_id = v.id ORDER BY p.id DESC LIMIT 5", (err, rows) => {
    console.log('--- SAMPLE PROCEDURES WITH VISIT ---', rows);
  });

  db.all("SELECT m.*, v.visit_date FROM medicines m JOIN visits v ON m.visit_id = v.id ORDER BY m.id DESC LIMIT 5", (err, rows) => {
    console.log('--- SAMPLE MEDICINES WITH VISIT ---', rows);
  });
});
