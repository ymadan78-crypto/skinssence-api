const db = require('./db');

function parseExpiryDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const parts = s.split('T')[0].split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const parts = s.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const dt = new Date(y, m, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    const m = parseInt(parts[0], 10) - 1;
    let y = parseInt(parts[1], 10);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, m + 1, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    let y = parseInt(parts[2], 10);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

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

db.all('SELECT * FROM inventory', [], (err, inventoryRows) => {
  if (err) return console.error('Inventory query error:', err);
  console.log('Fetched inventory rows:', inventoryRows.length);

  const salesQuery = `
    SELECT m.details, MAX(v.visit_date) as last_sale_date
    FROM medicines m
    JOIN visits v ON m.visit_id = v.id
    GROUP BY m.details
  `;

  db.all(salesQuery, [], (err2, salesRows) => {
    if (err2) return console.error('Sales query error:', err2);
    console.log('Fetched sales rows:', salesRows.length);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const byCategory = {
      expired: [],
      in3Months: [],
      in3To6Months: [],
      in6To12Months: [],
      over12Months: [],
      invalidDate: []
    };

    const processed = inventoryRows.map(item => {
      const expDate = parseExpiryDate(item.expiry_date);
      if (!expDate) {
        byCategory.invalidDate.push(item);
        return { ...item, status: 'INVALID_DATE', daysRemaining: null };
      }
      expDate.setHours(23, 59, 59, 999);
      const diffTime = expDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status = 'VALID_OVER_12M';
      if (daysRemaining < 0) { status = 'EXPIRED'; byCategory.expired.push(item); }
      else if (daysRemaining <= 90) { status = 'EXPIRING_SOON'; byCategory.in3Months.push(item); }
      else if (daysRemaining <= 180) { status = 'EXPIRING_3_6M'; byCategory.in3To6Months.push(item); }
      else if (daysRemaining <= 365) { status = 'VALID_6_12M'; byCategory.in6To12Months.push(item); }
      else { byCategory.over12Months.push(item); }

      return { ...item, status, daysRemaining };
    });

    console.log('SUCCESS! Summary tallies:');
    console.log('🔴 Expired:', byCategory.expired.length);
    console.log('🔴 <=3M:', byCategory.in3Months.length);
    console.log('🟠 3-6M:', byCategory.in3To6Months.length);
    console.log('🔵 6-12M:', byCategory.in6To12Months.length);
    console.log('🟢 >12M:', byCategory.over12Months.length);
    console.log('⚠️ Missing/Invalid Date:', byCategory.invalidDate.length);
    console.log('Total items processed:', processed.length);
  });
});
