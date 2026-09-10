with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_reports_block = """// 2. Comprehensive Clinic Sales & Revenue Analytics Report
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const todayStr = getISTDate();
  const currMonthKey = todayStr.substring(0, 7); // "YYYY-MM"

  // Previous Month Key
  const d = new Date(parseInt(currMonthKey.split('-')[0], 10), parseInt(currMonthKey.split('-')[1], 10) - 2, 1);
  const prevMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  db.all(`
    SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM procedures p
    JOIN visits v ON p.visit_id = v.id
  `, [], (err, procRows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`
      SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
    `, [], (err2, medRows) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const procs = procRows || [];
      const meds = medRows || [];

      // 1. TODAY STATS
      const todayProcs = procs.filter(p => p.visit_date === todayStr);
      const todayMeds = meds.filter(m => m.visit_date === todayStr);
      
      const todayProcRevenue = todayProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const todayProcSessions = todayProcs.length;
      const todayMedRevenue = todayMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
      const todayMedTransactions = todayMeds.length;
      const todayMedUnitsSold = todayMeds.reduce((s, m) => s + parseMedicineDetails(m.details).qty, 0);
      const todayTotalClinicSale = todayProcRevenue + todayMedRevenue;

      const todayStats = {
        totalClinicSale: todayTotalClinicSale,
        procedureRevenue: todayProcRevenue,
        procedureSessions: todayProcSessions,
        medicineRevenue: todayMedRevenue,
        medicineTransactions: todayMedTransactions,
        medicineUnitsSold: todayMedUnitsSold
      };"""

new_reports_block = """// 2. Comprehensive Clinic Sales & Revenue Analytics Report (Includes Consultations, Procedures, & Pharmacy)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const todayStr = getISTDate();
  const currMonthKey = todayStr.substring(0, 7); // "YYYY-MM"

  // Previous Month Key
  const d = new Date(parseInt(currMonthKey.split('-')[0], 10), parseInt(currMonthKey.split('-')[1], 10) - 2, 1);
  const prevMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  db.all(`
    SELECT v.id, v.consultation_fee, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM visits v
  `, [], (errV, visitRows) => {
    if (errV) return res.status(500).json({ error: errV.message });

    db.all(`
      SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
      FROM procedures p
      JOIN visits v ON p.visit_id = v.id
    `, [], (err, procRows) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(`
        SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
        FROM medicines m
        JOIN visits v ON m.visit_id = v.id
      `, [], (err2, medRows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const visits = visitRows || [];
        const procs = procRows || [];
        const meds = medRows || [];

        // 1. TODAY STATS
        const todayVisits = visits.filter(v => v.visit_date === todayStr);
        const todayProcs = procs.filter(p => p.visit_date === todayStr);
        const todayMeds = meds.filter(m => m.visit_date === todayStr);
        
        const todayConsultationRevenue = todayVisits.reduce((s, v) => s + (parseFloat(v.consultation_fee) || 0), 0);
        const todayConsultationCount = todayVisits.filter(v => (parseFloat(v.consultation_fee) || 0) > 0).length;
        const todayProcRevenue = todayProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const todayProcSessions = todayProcs.length;
        const todayMedRevenue = todayMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
        const todayMedTransactions = todayMeds.length;
        const todayMedUnitsSold = todayMeds.reduce((s, m) => s + parseMedicineDetails(m.details).qty, 0);
        const todayTotalClinicSale = todayConsultationRevenue + todayProcRevenue + todayMedRevenue;

        const todayStats = {
          totalClinicSale: todayTotalClinicSale,
          consultationRevenue: todayConsultationRevenue,
          consultationCount: todayConsultationCount,
          procedureRevenue: todayProcRevenue,
          procedureSessions: todayProcSessions,
          medicineRevenue: todayMedRevenue,
          medicineTransactions: todayMedTransactions,
          medicineUnitsSold: todayMedUnitsSold
        };"""

if old_reports_block in code:
    code = code.replace(old_reports_block, new_reports_block)
    print("Replaced reports block header in server.js!")
else:
    print("Warning: old_reports_block not found in server.js")

# Also update getOrInitMonth to track consultationRevenue
old_month_init = """            procedureRevenue: 0,
            procedureSessions: 0,
            medicineRevenue: 0,
            medicineTransactions: 0,
            medicineUnitsSold: 0,
            totalClinicSale: 0,
            procedures: {},
            medicines: {},
            dailyMap: {}"""

new_month_init = """            consultationRevenue: 0,
            consultationCount: 0,
            procedureRevenue: 0,
            procedureSessions: 0,
            medicineRevenue: 0,
            medicineTransactions: 0,
            medicineUnitsSold: 0,
            totalClinicSale: 0,
            procedures: {},
            medicines: {},
            dailyMap: {}"""

if old_month_init in code:
    code = code.replace(old_month_init, new_month_init)
    print("Updated getOrInitMonth in server.js!")

# Also process visits for consultation fees in monthMap
old_proc_loop = """      // Process Procedures
      procs.forEach(p => {"""

new_proc_loop = """      // Process Consultations
      visits.forEach(v => {
        const mKey = v.month_key || currMonthKey;
        const mObj = getOrInitMonth(mKey);
        const cFee = parseFloat(v.consultation_fee) || 0;
        if (cFee > 0) {
          mObj.consultationRevenue += cFee;
          mObj.consultationCount += 1;
          mObj.totalClinicSale += cFee;

          const dKey = v.visit_date;
          if (dKey) {
            if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, consultationSale: 0, procedureSale: 0, medicineSale: 0, totalSale: 0 };
            mObj.dailyMap[dKey].consultationSale = (mObj.dailyMap[dKey].consultationSale || 0) + cFee;
            mObj.dailyMap[dKey].totalSale += cFee;
          }
        }
      });

      // Process Procedures
      procs.forEach(p => {"""

if old_proc_loop in code:
    code = code.replace(old_proc_loop, new_proc_loop)
    print("Added visit consultation processing in reports loop!")

# Also fix the closing parenthesis for the nested db.all
old_end_reports = """        res.json({
          today: todayStats,
          currentMonth: currMonthData,
          previousMonth: prevMonthData,
          comparisons,
          monthWiseSales
        });
      });
    });
  });
});"""

new_end_reports = """        res.json({
          today: todayStats,
          currentMonth: currMonthData,
          previousMonth: prevMonthData,
          comparisons,
          monthWiseSales
        });
      });
    });
  });
  });
});"""

# Let's check how db.all ends in server.js around lines 1250-1280
with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated!")
