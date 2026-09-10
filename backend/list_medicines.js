const db = require('../../../../scratch/skinsense_app/backend/db.js');

db.all("SELECT id, name, category, default_instructions, mrp, quantity FROM medicines ORDER BY category, name", [], (err, rows) => {
  if (err) {
    console.error('Query error:', err);
    process.exit(1);
  }
  console.log(`TOTAL MEDICINES: ${rows.length}`);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
});
