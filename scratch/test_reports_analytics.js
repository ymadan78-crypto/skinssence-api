const db = require('../backend/db');

// Helper for IST Date
const getISTDate = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
};

function parseMedicineDetails(details) {
  if (!details || typeof details !== 'string') return { name: 'Unknown', qty: 1, batch: '' };
  
  let name = details;
  let batch = '';
  let qty = 1;

  const qtyMatch = details.match(/\(Qty:\s*(\d+)\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;

  const batchMatch = details.match(/\[Batch:\s*([^\]]+)\]/i);
  if (batchMatch) batch = batchMatch[1].trim();

  // Clean name
  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

const todayStr = getISTDate();
const currMonthKey = todayStr.substring(0, 7); // "YYYY-MM"

console.log('Testing reports analytics calculation for today:', todayStr, 'Month:', currMonthKey);

db.all(`
  SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
  FROM procedures p
  JOIN visits v ON p.visit_id = v.id
`, [], (err, procRows) => {
  if (err) return console.error('Proc error:', err);
  console.log('Total procedure rows:', procRows.length);

  db.all(`
    SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM medicines m
    JOIN visits v ON m.visit_id = v.id
  `, [], (err2, medRows) => {
    if (err2) return console.error('Med error:', err2);
    console.log('Total medicine rows:', medRows.length);

    console.log('Sample procedure rows:', procRows.slice(0, 5));
    console.log('Sample medicine rows:', medRows.slice(0, 5));
  });
});
