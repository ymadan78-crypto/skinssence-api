const db = require('../backend/db');

function parseMedicineDetails(details) {
  if (!details || typeof details !== 'string') return { name: 'Unknown', qty: 1, batch: '' };
  let name = details;
  let batch = '';
  let qty = 1;
  const qtyMatch = details.match(/\(Qty:\s*(\d+)\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;
  const batchMatch = details.match(/\[Batch:\s*([^\]]+)\]/i);
  if (batchMatch) batch = batchMatch[1].trim();
  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

// Test selecting from medicines as used in delete visit
db.all('SELECT details, amount FROM medicines LIMIT 5', [], (err, rows) => {
  if (err) return console.error('Error selecting from medicines:', err);
  console.log('Successfully selected medicines:', rows);
  rows.forEach(r => {
    console.log('Parsed:', parseMedicineDetails(r.details));
  });
});
