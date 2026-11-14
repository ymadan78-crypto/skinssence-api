const db = require('../db');

(async () => {
  try {
    const targetDate = '2026-11-13';
    console.log(`Calculating 2-category collections for ${targetDate}...`);

    const visits = await db.allAsync(`
      SELECT v.*, p.first_name, p.last_name, p.skinssence_id
      FROM visits v JOIN patients p ON v.patient_id = p.id
      WHERE date(v.visit_date) = date(?) OR v.visit_date LIKE ?
    `, [targetDate, `${targetDate}%`]);

    const vIds = visits.map(v => v.id);
    const placeholders = vIds.map(() => '?').join(',');
    const procs = await db.allAsync(`SELECT * FROM procedures WHERE visit_id IN (${placeholders})`, vIds);
    const meds = await db.allAsync(`SELECT * FROM medicines WHERE visit_id IN (${placeholders})`, vIds);
    const pays = await db.allAsync(`SELECT * FROM payments WHERE date(payment_date) = date(?) OR payment_date LIKE ?`, [targetDate, `${targetDate}%`]);

    let totalProcCollection = 0;
    let totalMedCollection = 0;
    let grandTotalCollection = 0;

    pays.forEach(pay => {
      const amt = parseFloat(pay.amount_received) || 0;
      grandTotalCollection += amt;

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

      totalProcCollection += procPart;
      totalMedCollection += medPart;
    });

    console.log(`\n=== 2-CATEGORY FINANCIAL REPORT FOR ${targetDate} ===`);
    console.log(`1. Procedure Collection (incl. consultation): ₹${totalProcCollection.toFixed(2)}`);
    console.log(`2. Medicine Collection (pharmacy sales):      ₹${totalMedCollection.toFixed(2)}`);
    console.log(`----------------------------------------------------`);
    console.log(`GRAND TOTAL COLLECTION:                       ₹${grandTotalCollection.toFixed(2)}`);
    console.log(`Sum of Categories (Proc + Med):               ₹${(totalProcCollection + totalMedCollection).toFixed(2)}`);
    console.log(`Match exactly?`, Math.abs(grandTotalCollection - (totalProcCollection + totalMedCollection)) < 0.01);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
