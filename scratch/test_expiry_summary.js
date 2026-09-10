const db = require('../backend/db');

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
    const m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    if (y < 100) y = 2000 + y;
    if (m >= 1 && m <= 12) {
      const dt = new Date(y, m, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }
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

db.all('SELECT * FROM inventory', [], (err, rows) => {
  if (err) return console.error(err);
  console.log('Total inventory records in DB:', rows.length);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const processed = rows.map(item => {
    const expDate = parseExpiryDate(item.expiry_date);
    if (!expDate) {
      return {
        ...item,
        status: 'INVALID_DATE',
        statusLabel: 'MISSING / INVALID DATE',
        daysRemaining: null,
        color: '#6b7280',
        bgColor: '#f3f4f6',
        borderColor: '#d1d5db'
      };
    }

    expDate.setHours(23, 59, 59, 999);
    const diffTime = expDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let status = 'VALID_OVER_12M';
    let statusLabel = 'VALID (> 12 MONTHS)';
    let color = '#16a34a'; // Green
    let bgColor = '#f0fdf4';
    let borderColor = '#86efac';

    if (daysRemaining < 0) {
      status = 'EXPIRED';
      statusLabel = 'EXPIRED';
      color = '#7f1d1d'; // Dark Red
      bgColor = '#fee2e2';
      borderColor = '#ef4444';
    } else if (daysRemaining <= 90) {
      status = 'EXPIRING_SOON';
      statusLabel = 'EXPIRING SOON (≤ 3M)';
      color = '#dc2626'; // Red
      bgColor = '#fef2f2';
      borderColor = '#fca5a5';
    } else if (daysRemaining <= 180) {
      status = 'EXPIRING_3_6M';
      statusLabel = 'EXPIRING (3–6M)';
      color = '#d97706'; // Orange
      bgColor = '#fffbeb';
      borderColor = '#fcd34d';
    } else if (daysRemaining <= 365) {
      status = 'VALID_6_12M';
      statusLabel = 'VALID (6–12M)';
      color = '#2563eb'; // Blue
      bgColor = '#eff6ff';
      borderColor = '#93c5fd';
    }

    return {
      ...item,
      status,
      statusLabel,
      daysRemaining,
      color,
      bgColor,
      borderColor,
      formattedExpiry: expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    };
  });

  // Sort nearest expiry first
  const validSorted = processed
    .filter(i => i.daysRemaining !== null)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const invalidList = processed.filter(i => i.daysRemaining === null);
  const allSorted = [...validSorted, ...invalidList];

  console.log('--- PROCESSED EXPIRY SUMMARY ---');
  console.log('Expired count:', processed.filter(i => i.status === 'EXPIRED').length);
  console.log('≤ 3 Months count:', processed.filter(i => i.status === 'EXPIRING_SOON').length);
  console.log('3-6 Months count:', processed.filter(i => i.status === 'EXPIRING_3_6M').length);
  console.log('6-12 Months count:', processed.filter(i => i.status === 'VALID_6_12M').length);
  console.log('> 12 Months count:', processed.filter(i => i.status === 'VALID_OVER_12M').length);
  console.log('Invalid count:', invalidList.length);
  console.log('--- ALL SORTED MEDICINES ---');
  allSorted.forEach(m => {
    console.log(`${m.medicine_name} | Batch: ${m.batch_number} | Qty: ${m.quantity} | Exp: ${m.expiry_date} -> ${m.daysRemaining} days left [${m.statusLabel}]`);
  });
});
