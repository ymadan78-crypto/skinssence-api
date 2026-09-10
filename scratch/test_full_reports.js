const db = require('../backend/db');

function parseMedicineDetails(details) {
  if (!details || typeof details !== 'string') return { name: 'Unknown', qty: 1, batch: '' };
  
  let name = details;
  let batch = '';
  let qty = 1;

  const qtyMatch = details.match(/\(Qty:\s*(\d+)\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;

  const batchMatch = details.match(/\[Batch:\s*([^\]]+)\]/i);
  if (batchMatch) batch = batchMatch[1].trim();

  // Clean name
  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

const getISTDate = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
};

const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

const todayStr = getISTDate();
const currMonthKey = todayStr.substring(0, 7);

// Previous Month Key
const d = new Date(parseInt(currMonthKey.split('-')[0], 10), parseInt(currMonthKey.split('-')[1], 10) - 2, 1);
const prevMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

console.log('Today:', todayStr, '| Current Month:', currMonthKey, '| Previous Month:', prevMonthKey);

db.all(`
  SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
  FROM procedures p
  JOIN visits v ON p.visit_id = v.id
`, [], (err, procRows) => {
  if (err) return console.error(err);

  db.all(`
    SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM medicines m
    JOIN visits v ON m.visit_id = v.id
  `, [], (err2, medRows) => {
    if (err2) return console.error(err2);

    // 1. TODAY STATS
    const todayProcs = procRows.filter(p => p.visit_date === todayStr);
    const todayMeds = medRows.filter(m => m.visit_date === todayStr);
    
    const todayProcRevenue = todayProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const todayProcSessions = todayProcs.length;
    const todayMedRevenue = todayMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
    const todayMedTransactions = todayMeds.length;
    const todayMedUnitsSold = todayMeds.reduce((s, m) => s + parseMedicineDetails(m.details).qty, 0);
    const todayTotalClinicSale = todayProcRevenue + todayMedRevenue;

    console.log('=== TODAY STATS ===', {
      totalClinicSale: todayTotalClinicSale,
      procRevenue: todayProcRevenue,
      procSessions: todayProcSessions,
      medRevenue: todayMedRevenue,
      medTransactions: todayMedTransactions,
      medUnitsSold: todayMedUnitsSold
    });

    // 2. MONTHS MAP
    const monthsMap = {};

    const getOrInitMonth = (mKey) => {
      if (!monthsMap[mKey]) {
        monthsMap[mKey] = {
          monthKey: mKey,
          monthLabel: formatMonthLabel(mKey),
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

    // Process Procedures
    procRows.forEach(p => {
      const mKey = p.month_key || currMonthKey;
      const mObj = getOrInitMonth(mKey);
      const amt = parseFloat(p.amount) || 0;
      mObj.procedureRevenue += amt;
      mObj.procedureSessions += 1;

      // Group by procedure name
      const pName = p.name ? p.name.trim() : 'Unknown Procedure';
      if (!mObj.procedures[pName]) mObj.procedures[pName] = { name: pName, sessions: 0, revenue: 0 };
      mObj.procedures[pName].sessions += 1;
      mObj.procedures[pName].revenue += amt;

      // Daily Breakdown
      const dKey = p.visit_date;
      if (dKey) {
        if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, procedureSale: 0, medicineSale: 0, totalSale: 0 };
        mObj.dailyMap[dKey].procedureSale += amt;
        mObj.dailyMap[dKey].totalSale += amt;
      }
    });

    // Process Medicines
    medRows.forEach(m => {
      const mKey = m.month_key || currMonthKey;
      const mObj = getOrInitMonth(mKey);
      const amt = parseFloat(m.amount) || 0;
      const parsed = parseMedicineDetails(m.details);
      mObj.medicineRevenue += amt;
      mObj.medicineTransactions += 1;
      mObj.medicineUnitsSold += parsed.qty;

      // Group by medicine clean name
      const mName = parsed.name;
      if (!mObj.medicines[mName]) mObj.medicines[mName] = { name: mName, unitsSold: 0, revenue: 0, transactions: 0 };
      mObj.medicines[mName].unitsSold += parsed.qty;
      mObj.medicines[mName].revenue += amt;
      mObj.medicines[mName].transactions += 1;

      // Daily Breakdown
      const dKey = m.visit_date;
      if (dKey) {
        if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, procedureSale: 0, medicineSale: 0, totalSale: 0 };
        mObj.dailyMap[dKey].medicineSale += amt;
        mObj.dailyMap[dKey].totalSale += amt;
      }
    });

    // Finalize totals and rankings for all months
    const allMonthsKeys = Object.keys(monthsMap).sort().reverse();
    allMonthsKeys.forEach(mKey => {
      const mObj = monthsMap[mKey];
      mObj.totalClinicSale = mObj.procedureRevenue + mObj.medicineRevenue;
      mObj.avgMedicineSale = mObj.medicineTransactions > 0 ? (mObj.medicineRevenue / mObj.medicineTransactions) : 0;

      // Procedure Rankings
      const procList = Object.values(mObj.procedures).map(p => ({
        ...p,
        avgRevenuePerSession: p.sessions > 0 ? (p.revenue / p.sessions) : 0
      }));
      mObj.topProceduresBySessions = [...procList].sort((a, b) => b.sessions - a.sessions);
      mObj.topProceduresByRevenue = [...procList].sort((a, b) => b.revenue - a.revenue);

      // Medicine Rankings
      const medList = Object.values(mObj.medicines);
      mObj.topMedicinesByQty = [...medList].sort((a, b) => b.unitsSold - a.unitsSold);
      mObj.topMedicinesByRevenue = [...medList].sort((a, b) => b.revenue - a.revenue);

      // Daily List
      mObj.dailySalesList = Object.values(mObj.dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    });

    const currMonthObj = monthsMap[currMonthKey] || getOrInitMonth(currMonthKey);
    const prevMonthObj = monthsMap[prevMonthKey] || getOrInitMonth(prevMonthKey);

    // Monthly Comparison
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

    console.log('=== COMPARISON (Current vs Previous) ===', comparison);
    console.log('=== MONTHS KEYS AVAILABLE ===', allMonthsKeys);
  });
});
