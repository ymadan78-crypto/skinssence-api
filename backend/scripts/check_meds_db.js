const db = require('../db');

(async () => {
  try {
    const visitsWithMeds = await db.allAsync(`
      SELECT v.id, v.patient_id, v.visit_date, count(m.id) as med_count 
      FROM visits v 
      JOIN medicines m ON m.visit_id = v.id 
      GROUP BY v.id 
      ORDER BY v.id DESC 
      LIMIT 10
    `);
    console.log('Visits with meds:', visitsWithMeds);

    for (const vm of visitsWithMeds.slice(0, 3)) {
      const meds = await db.allAsync('SELECT * FROM medicines WHERE visit_id = ?', [vm.id]);
      console.log(`Visit ${vm.id} meds:`, meds);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
})();
