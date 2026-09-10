with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's add the outer db.all for visits in GET /api/admin/reports
old_block = """// 2. Comprehensive Clinic Sales & Revenue Analytics Report
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
      };

      // 2. MONTHS MAP
      const monthsMap = {};

      const getOrInitMonth = (mKey) => {
        if (!monthsMap[mKey]) {
          monthsMap[mKey] = {
            monthKey: mKey,
            monthLabel: formatMonthLabel(mKey),
            fullMonthLabel: formatFullMonthLabel(mKey),
            procedureRevenue: 0,
            procedureSessions: 0,
            medicineRevenue: 0,
            medicineTransactions: 0,
            medicineUnitsSold: 0,
            totalClinicSale: 0,
            procedures: {},
            medicines: {},
            dailyMap: {}
          };
        }
        return monthsMap[mKey];
      };

      // Ensure current & prev months are initialized
      getOrInitMonth(currMonthKey);
      getOrInitMonth(prevMonthKey);

      // Process Procedures
      procs.forEach(p => {
        const mKey = p.month_key || currMonthKey;
        const mObj = getOrInitMonth(mKey);
        const amt = parseFloat(p.amount) || 0;
        mObj.procedureRevenue += amt;
        mObj.procedureSessions += 1;

        const pName = p.name ? p.name.trim() : 'Consultation / General Procedure';
        if (!mObj.procedures[pName]) mObj.procedures[pName] = { name: pName, sessions: 0, revenue: 0 };
        mObj.procedures[pName].sessions += 1;
        mObj.procedures[pName].revenue += amt;

        const dKey = p.visit_date;
        if (dKey) {
          if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, procedureSale: 0, medicineSale: 0, totalSale: 0 };
          mObj.dailyMap[dKey].procedureSale += amt;
          mObj.dailyMap[dKey].totalSale += amt;
        }
      });"""

new_block = """// 2. Comprehensive Clinic Sales & Revenue Analytics Report (Includes Consultation Fees, Procedures, & Pharmacy)
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
        };

        // 2. MONTHS MAP
        const monthsMap = {};

        const getOrInitMonth = (mKey) => {
          if (!monthsMap[mKey]) {
            monthsMap[mKey] = {
              monthKey: mKey,
              monthLabel: formatMonthLabel(mKey),
              fullMonthLabel: formatFullMonthLabel(mKey),
              consultationRevenue: 0,
              consultationCount: 0,
              procedureRevenue: 0,
              procedureSessions: 0,
              medicineRevenue: 0,
              medicineTransactions: 0,
              medicineUnitsSold: 0,
              totalClinicSale: 0,
              procedures: {},
              medicines: {},
              dailyMap: {}
            };
          }
          return monthsMap[mKey];
        };

        // Ensure current & prev months are initialized
        getOrInitMonth(currMonthKey);
        getOrInitMonth(prevMonthKey);

        // Process Consultations
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
        procs.forEach(p => {
          const mKey = p.month_key || currMonthKey;
          const mObj = getOrInitMonth(mKey);
          const amt = parseFloat(p.amount) || 0;
          mObj.procedureRevenue += amt;
          mObj.procedureSessions += 1;
          mObj.totalClinicSale += amt;

          const pName = p.name ? p.name.trim() : 'General Procedure';
          if (!mObj.procedures[pName]) mObj.procedures[pName] = { name: pName, sessions: 0, revenue: 0 };
          mObj.procedures[pName].sessions += 1;
          mObj.procedures[pName].revenue += amt;

          const dKey = p.visit_date;
          if (dKey) {
            if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, consultationSale: 0, procedureSale: 0, medicineSale: 0, totalSale: 0 };
            mObj.dailyMap[dKey].procedureSale += amt;
            mObj.dailyMap[dKey].totalSale += amt;
          }
        });"""

old_closing = """        res.json({
        today: todayStats,
        currentMonth: currMonthObj,
        previousMonth: prevMonthObj,
        comparison,
        monthWiseSales,
        availableMonths,
        // Legacy fields for backwards compatibility
        todayLegacy: { clinic_points: todayProcRevenue, medicine_points: todayMedRevenue, expense: 0 },
        months: {},
        years: {}
      });
    });
  });
});"""

new_closing = """        res.json({
        today: todayStats,
        currentMonth: currMonthObj,
        previousMonth: prevMonthObj,
        comparison,
        monthWiseSales,
        availableMonths,
        // Legacy fields for backwards compatibility
        todayLegacy: { clinic_points: todayProcRevenue, medicine_points: todayMedRevenue, expense: 0 },
        months: {},
        years: {}
      });
    });
  });
  });
});"""

if old_block in code:
    code = code.replace(old_block, new_block)
    print("Replaced main block!")
else:
    print("Warning: old_block not matched!")

if old_closing in code:
    code = code.replace(old_closing, new_closing)
    print("Replaced closing block!")
else:
    print("Warning: old_closing not matched!")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully!")
