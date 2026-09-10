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

const testDates = ['09/2026', '09/26', '10/2028', '2026-10-15', '15/10/2026', '15-10-2026', '2026-12', 'Invalid Date', '', null];

testDates.forEach(td => {
  const parsed = parseExpiryDate(td);
  console.log(`Input: "${td}" -> Parsed:`, parsed ? parsed.toISOString().split('T')[0] : 'INVALID/NULL');
});
