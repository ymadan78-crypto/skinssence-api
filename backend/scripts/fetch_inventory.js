const db = require('../db');
const fs = require('fs');
const path = require('path');

async function main() {
  const res = await db.client.execute("SELECT * FROM inventory ORDER BY medicine_name ASC");
  console.log('Total inventory rows:', res.rows.length);
  fs.writeFileSync(path.join(__dirname, 'inventory_items.json'), JSON.stringify(res.rows, null, 2));
  console.log('Saved to inventory_items.json');
}

main().catch(console.error);
