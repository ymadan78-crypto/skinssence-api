const db = require('../backend/db');

console.log('--- TESTING UPDATED REPORTS & REVENUE CALCULATION ---');

const todayStr = '2026-09-03';
const currMonthKey = '2026-09';

db.all(`
  SELECT v.id, v.consultation_fee, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
  FROM visits v
`, [], (errV, visitRows) => {
  db.all(`
    SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM procedures p
    JOIN visits v ON p.visit_id = v.id
  `, [], (errP, procRows) => {
    db.all(`
      SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
    `, [], (errM, medRows) => {
      const visits = visitRows || [];
      const procs = procRows || [];
      const meds = medRows || [];

      const todayVisits = visits.filter(v => v.visit_date === todayStr);
      const todayProcs = procs.filter(p => p.visit_date === todayStr);
      const todayMeds = meds.filter(m => m.visit_date === todayStr);

      const todayConsultationRevenue = todayVisits.reduce((s, v) => s + (parseFloat(v.consultation_fee) || 0), 0);
      const todayConsultationCount = todayVisits.filter(v => (parseFloat(v.consultation_fee) || 0) > 0).length;
      const todayProcRevenue = todayProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const todayProcSessions = todayProcs.length;
      const todayMedRevenue = todayMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
      const todayMedTransactions = todayMeds.length;
      const todayTotalClinicSale = todayConsultationRevenue + todayProcRevenue + todayMedRevenue;

      console.log('Updated Today Stats:');
      console.log('  🩺 Consultation Fees: ₹', todayConsultationRevenue, `(${todayConsultationCount} visits)`);
      console.log('  🏥 Procedure Revenue: ₹', todayProcRevenue, `(${todayProcSessions} sessions)`);
      console.log('  💊 Medicine Revenue:  ₹', todayMedRevenue, `(${todayMedTransactions} transactions)`);
      console.log('  📊 Total Clinic Sale: ₹', todayTotalClinicSale);
    });
  });
});
