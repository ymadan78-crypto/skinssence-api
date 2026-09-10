const db = require('../backend/db');

db.all('SELECT id, medicine_name, batch_number, quantity, expiry_date, mrp FROM inventory LIMIT 50', [], (err, rows) => {
  if (err) {
    console.error('Inventory query error:', err);
  } else {
    console.log(`Total inventory items fetched: ${rows.length}`);
    console.log('Sample items:', rows.slice(0, 20));
  }
});
