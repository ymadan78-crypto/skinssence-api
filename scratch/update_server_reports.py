reports_endpoint_code = '''// Helper to parse clean medicine name, quantity, batch
function parseMedicineDetails(details) {
  if (!details || typeof details !== 'string') return { name: 'Unknown', qty: 1, batch: '' };
  
  let name = details;
  let batch = '';
  let qty = 1;

  const qtyMatch = details.match(/\\(Qty:\\s*(\\d+)\\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;

  const batchMatch = details.match(/\\[Batch:\\s*([^\\]]+)\\]/i);
  if (batchMatch) batch = batchMatch[1].trim();

  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

const formatFullMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

// 2. Comprehensive Clinic Sales & Revenue Analytics Report
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
      });

      // Process Medicines
      meds.forEach(m => {
        const mKey = m.month_key || currMonthKey;
        const mObj = getOrInitMonth(mKey);
        const amt = parseFloat(m.amount) || 0;
        const parsed = parseMedicineDetails(m.details);
        mObj.medicineRevenue += amt;
        mObj.medicineTransactions += 1;
        mObj.medicineUnitsSold += parsed.qty;

        const mName = parsed.name;
        if (!mObj.medicines[mName]) mObj.medicines[mName] = { name: mName, unitsSold: 0, revenue: 0, transactions: 0 };
        mObj.medicines[mName].unitsSold += parsed.qty;
        mObj.medicines[mName].revenue += amt;
        mObj.medicines[mName].transactions += 1;

        const dKey = m.visit_date;
        if (dKey) {
          if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, procedureSale: 0, medicineSale: 0, totalSale: 0 };
          mObj.dailyMap[dKey].medicineSale += amt;
          mObj.dailyMap[dKey].totalSale += amt;
        }
      });

      // Finalize totals and rankings for all months
      const allMonthsKeys = Object.keys(monthsMap).sort().reverse();
      const monthWiseSales = allMonthsKeys.map(mKey => {
        const mObj = monthsMap[mKey];
        mObj.totalSale = mObj.procedureRevenue + mObj.medicineRevenue;
        mObj.totalClinicSale = mObj.totalSale;
        mObj.avgMedicineSale = mObj.medicineTransactions > 0 ? (mObj.medicineRevenue / mObj.medicineTransactions) : 0;

        // Procedure Rankings
        const procList = Object.values(mObj.procedures).map(p => ({
          ...p,
          avgRevenuePerSession: p.sessions > 0 ? (p.revenue / p.sessions) : 0
        }));
        mObj.topProceduresBySessions = [...procList]
          .sort((a, b) => b.sessions - a.sessions)
          .map((p, idx) => ({ rank: idx + 1, ...p }));
        
        mObj.topProceduresByRevenue = [...procList]
          .sort((a, b) => b.revenue - a.revenue)
          .map((p, idx) => ({ rank: idx + 1, ...p }));

        // Medicine Rankings
        const medList = Object.values(mObj.medicines);
        mObj.topMedicinesByQty = [...medList]
          .sort((a, b) => b.unitsSold - a.unitsSold)
          .map((m, idx) => ({ rank: idx + 1, ...m }));
        
        mObj.topMedicinesByRevenue = [...medList]
          .sort((a, b) => b.revenue - a.revenue)
          .map((m, idx) => ({ rank: idx + 1, ...m }));

        // Daily List
        mObj.dailySalesList = Object.values(mObj.dailyMap)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(dItem => {
            const parts = dItem.date.split('-');
            const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dateLabel = dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return { ...dItem, dateLabel };
          });

        return mObj;
      });

      const currMonthObj = monthsMap[currMonthKey];
      const prevMonthObj = monthsMap[prevMonthKey];

      // Monthly Comparison (Current vs Previous)
      const calcChange = (curr, prev) => {
        const diff = curr - prev;
        const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : 'N/A';
        return { diff, pct };
      };

      const comparison = {
        totalSale: { curr: currMonthObj.totalClinicSale, prev: prevMonthObj.totalClinicSale, ...calcChange(currMonthObj.totalClinicSale, prevMonthObj.totalClinicSale) },
        procedureRevenue: { curr: currMonthObj.procedureRevenue, prev: prevMonthObj.procedureRevenue, ...calcChange(currMonthObj.procedureRevenue, prevMonthObj.procedureRevenue) },
        medicineRevenue: { curr: currMonthObj.medicineRevenue, prev: prevMonthObj.medicineRevenue, ...calcChange(currMonthObj.medicineRevenue, prevMonthObj.medicineRevenue) },
        procedureSessions: { curr: currMonthObj.procedureSessions, prev: prevMonthObj.procedureSessions, ...calcChange(currMonthObj.procedureSessions, prevMonthObj.procedureSessions) },
        medicineTransactions: { curr: currMonthObj.medicineTransactions, prev: prevMonthObj.medicineTransactions, ...calcChange(currMonthObj.medicineTransactions, prevMonthObj.medicineTransactions) }
      };

      const availableMonths = allMonthsKeys.map(k => ({
        key: k,
        label: monthsMap[k].fullMonthLabel
      }));

      res.json({
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

app.get('/api/reports/procedures', authenticateToken, (req, res) => {
  db.all(`
    SELECT p.name, COUNT(*) as frequency, SUM(p.amount) as revenue
    FROM procedures p
    GROUP BY p.name
    ORDER BY frequency DESC
    LIMIT 30
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});'''

with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

target_start = "// 2. Admin: Income vs Expenses Report"
target_end = "// 4. Upcoming Events (Next 10 Days)"

start_idx = code.find(target_start)
end_idx = code.find(target_end)

if start_idx != -1 and end_idx != -1:
    new_code = code[:start_idx] + reports_endpoint_code + '\n\n' + code[end_idx:]
    with open('backend/server.js', 'w', encoding='utf-8') as f:
        f.write(new_code)
    print("server.js updated with new comprehensive reports endpoint!")
else:
    print("Error: Could not find target slice in server.js")
