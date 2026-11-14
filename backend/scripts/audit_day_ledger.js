const db = require('../db');

(async () => {
  try {
    const targetDate = process.argv[2] || '2026-11-13';
    console.log(`\n=== AUDITING DATE: ${targetDate} ===`);

    const visits = await db.allAsync(`
      SELECT v.*, p.first_name, p.last_name, p.skinssence_id, p.mobile
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE date(v.visit_date) = date(?) OR v.visit_date LIKE ?
      ORDER BY v.id ASC
    `, [targetDate, `${targetDate}%`]);
    console.log(`Visits found (${visits.length}):`);

    const vIds = visits.map(v => v.id);
    if (vIds.length > 0) {
      const placeholders = vIds.map(() => '?').join(',');
      const meds = await db.allAsync(`
        SELECT * FROM medicines WHERE visit_id IN (${placeholders}) ORDER BY visit_id, id
      `, vIds);
      console.log(`Medicines found (${meds.length})`);

      const pays = await db.allAsync(`
        SELECT * FROM payments WHERE date(payment_date) = date(?) OR payment_date LIKE ? ORDER BY id
      `, [targetDate, `${targetDate}%`]);
      console.log(`Payments found (${pays.length})`);

      // Let's see medicines by patient
      const patMeds = {};
      meds.forEach(m => {
        const v = visits.find(v => v.id === m.visit_id);
        const patKey = v ? `Pat #${v.patient_id} (${v.first_name} ${v.last_name}) [Visit #${v.id}]` : `Visit #${m.visit_id}`;
        if (!patMeds[patKey]) patMeds[patKey] = [];
        patMeds[patKey].push(m);
      });

      console.log('\n--- Medicines by Patient / Visit ---');
      for (const [pat, mList] of Object.entries(patMeds)) {
        const sum = mList.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
        console.log(`${pat} -> ${mList.length} items, Total: ₹${sum}`);
        mList.forEach(m => console.log(`   - Med #${m.id}: "${m.details}" -> ₹${m.amount}`));
      }

      // Check payments matching these visits
      console.log('\n--- Payments on this day ---');
      pays.forEach(p => {
        console.log(`Pay #${p.id} (Visit #${p.visit_id}, Pat #${p.patient_id}): Mode=${p.mode}, Amount=₹${p.amount_received}, Purpose=${p.purpose}`);
      });
    }
  } catch (e) {
    console.error('Audit Error:', e);
  } finally {
    process.exit(0);
  }
})();
