const db = require('../db');

async function calculateSessionFinancialReports(targetDate) {
  // 1. Fetch sessions for targetDate to know closed_at timestamp of Session 1
  const sessions = await db.allAsync(
    'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
    [targetDate]
  );
  const s1 = (sessions || []).find(s => s.session_number === 1);
  const s1ClosedAt = s1 && s1.closed_at ? s1.closed_at : null;

  // 2. Fetch all payments on targetDate
  const payments = await db.allAsync(`
    SELECT * FROM payments 
    WHERE date(payment_date) = date(?) OR payment_date LIKE ?
    ORDER BY id ASC
  `, [targetDate, `${targetDate}%`]);

  // 3. Fetch visits on targetDate (or for the payments' visit_ids)
  const vIds = Array.from(new Set(payments.map(p => p.visit_id).filter(Boolean)));
  let visits = [];
  let procs = [];
  let meds = [];

  if (vIds.length > 0) {
    const placeholders = vIds.map(() => '?').join(',');
    visits = await db.allAsync(`SELECT * FROM visits WHERE id IN (${placeholders})`, vIds);
    procs = await db.allAsync(`SELECT * FROM procedures WHERE visit_id IN (${placeholders})`, vIds);
    meds = await db.allAsync(`SELECT * FROM medicines WHERE visit_id IN (${placeholders})`, vIds);
  }

  const reports = {
    session_1: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    session_2: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    full_day: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 }
  };

  payments.forEach(pay => {
    const amt = parseFloat(pay.amount_received) || 0;
    if (amt <= 0) return;

    // Determine session:
    // If pay.session_num is explicitly 1 or 2, use it
    // Else if s1ClosedAt exists, compare pay.payment_date <= s1ClosedAt -> 1, else 2
    // Else default: payment time < 15:00 IST -> 1, else 2
    let sNum = pay.session_num;
    if (sNum !== 1 && sNum !== 2) {
      if (s1ClosedAt) {
        sNum = (pay.payment_date <= s1ClosedAt) ? 1 : 2;
      } else {
        const timePart = (pay.payment_date || '').includes('T') ? pay.payment_date.split('T')[1] : '';
        const hour = parseInt(timePart.slice(0, 2), 10) || 12;
        // In UTC, 09:30 UTC is 15:00 IST
        sNum = hour < 10 ? 1 : 2;
      }
    }

    const v = visits.find(v => v.id === pay.visit_id);
    let procPart = 0;
    let medPart = 0;

    if (!v) {
      if (pay.purpose === 'PHARMACY') medPart = amt;
      else procPart = amt;
    } else {
      const cFee = parseFloat(v.consultation_fee) || 0;
      const vProcs = procs.filter(p => p.visit_id === v.id);
      const vMeds = meds.filter(m => m.visit_id === v.id);
      const procSum = vProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) + cFee;
      const medSum = vMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
      const totalBilled = procSum + medSum;

      if (pay.purpose === 'PHARMACY' || (totalBilled > 0 && procSum === 0)) {
        medPart = amt;
      } else if (medSum === 0) {
        procPart = amt;
      } else if (totalBilled > 0) {
        const ratio = procSum / totalBilled;
        procPart = Math.round(amt * ratio * 100) / 100;
        medPart = Math.round((amt - procPart) * 100) / 100;
      } else {
        procPart = amt;
      }
    }

    const targetKey = sNum === 1 ? 'session_1' : 'session_2';
    reports[targetKey].procedure_collection += procPart;
    reports[targetKey].medicine_collection += medPart;
    reports[targetKey].grand_total += amt;
    reports[targetKey].count += 1;

    reports.full_day.procedure_collection += procPart;
    reports.full_day.medicine_collection += medPart;
    reports.full_day.grand_total += amt;
    reports.full_day.count += 1;
  });

  // Round all totals to 2 decimal places to avoid floating point precision artifacts
  ['session_1', 'session_2', 'full_day'].forEach(k => {
    reports[k].procedure_collection = Math.round(reports[k].procedure_collection * 100) / 100;
    reports[k].medicine_collection = Math.round(reports[k].medicine_collection * 100) / 100;
    reports[k].grand_total = Math.round(reports[k].grand_total * 100) / 100;
  });

  return reports;
}

(async () => {
  try {
    const targetDate = '2026-11-13';
    const rep = await calculateSessionFinancialReports(targetDate);
    console.log(`Financial Reports for ${targetDate}:`, JSON.stringify(rep, null, 2));

    const s1 = rep.session_1;
    const s2 = rep.session_2;
    const fd = rep.full_day;

    console.log('\n--- VERIFICATION CHECKS ---');
    console.log('1. Session 1: Proc + Med = Grand Total:', (s1.procedure_collection + s1.medicine_collection).toFixed(2), '===', s1.grand_total.toFixed(2), Math.abs(s1.procedure_collection + s1.medicine_collection - s1.grand_total) < 0.01);
    console.log('2. Session 2: Proc + Med = Grand Total:', (s2.procedure_collection + s2.medicine_collection).toFixed(2), '===', s2.grand_total.toFixed(2), Math.abs(s2.procedure_collection + s2.medicine_collection - s2.grand_total) < 0.01);
    console.log('3. Full Day: Proc + Med = Grand Total:', (fd.procedure_collection + fd.medicine_collection).toFixed(2), '===', fd.grand_total.toFixed(2), Math.abs(fd.procedure_collection + fd.medicine_collection - fd.grand_total) < 0.01);
    console.log('4. S1 + S2 Proc = Full Day Proc:', (s1.procedure_collection + s2.procedure_collection).toFixed(2), '===', fd.procedure_collection.toFixed(2), Math.abs(s1.procedure_collection + s2.procedure_collection - fd.procedure_collection) < 0.01);
    console.log('5. S1 + S2 Med = Full Day Med:', (s1.medicine_collection + s2.medicine_collection).toFixed(2), '===', fd.medicine_collection.toFixed(2), Math.abs(s1.medicine_collection + s2.medicine_collection - fd.medicine_collection) < 0.01);
    console.log('6. S1 + S2 Grand Total = Full Day Grand Total:', (s1.grand_total + s2.grand_total).toFixed(2), '===', fd.grand_total.toFixed(2), Math.abs(s1.grand_total + s2.grand_total - fd.grand_total) < 0.01);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
