replacement = '''// Robust Expiry Date Parser
function parseExpiryDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  // 1. ISO or YYYY-MM-DD
  if (/^\\d{4}-\\d{1,2}-\\d{1,2}/.test(s)) {
    const parts = s.split('T')[0].split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. YYYY-MM
  if (/^\\d{4}-\\d{1,2}$/.test(s)) {
    const parts = s.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const dt = new Date(y, m, 0); // last day of month
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. MM/YYYY or MM/YY or MM-YYYY or MM-YY
  if (/^\\d{1,2}[\\/\\-]\\d{2,4}$/.test(s)) {
    const parts = s.split(/[\\/\\-]/);
    const m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    if (y < 100) y = 2000 + y;
    if (m >= 1 && m <= 12) {
      const dt = new Date(y, m, 0); // last day of expiry month
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // 4. DD/MM/YYYY or DD-MM-YYYY
  if (/^\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}$/.test(s)) {
    const parts = s.split(/[\\/\\-]/);
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

app.get('/api/inventory/analytics', authenticateToken, (req, res) => {
  db.all('SELECT * FROM inventory', [], (err, inventoryRows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const salesQuery = `
      SELECT m.name, MAX(v.visit_date) as last_sale_date
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
      GROUP BY m.name
    `;
    
    db.all(salesQuery, [], (err, salesRows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const salesMap = {};
      if (salesRows && salesRows.length > 0) {
        salesRows.forEach(row => {
          if (row.name) salesMap[row.name.toLowerCase().trim()] = new Date(row.last_sale_date);
        });
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const byCategory = {
        expired: [],
        in3Months: [],
        in3To6Months: [],
        in6To12Months: [],
        over12Months: [],
        invalidDate: []
      };

      const expiringSoonAlarm = [];
      const deadStock = {
        notSold7Days: [],
        notSold1Month: [],
        notSold3Months: [],
        notSold6Months: [],
        notSold9Months: [],
        notSold1Year: []
      };

      const processedItems = (inventoryRows || []).map(item => {
        const expDate = parseExpiryDate(item.expiry_date);
        
        if (!expDate) {
          const itemObj = {
            ...item,
            status: 'INVALID_DATE',
            statusLabel: 'MISSING / INVALID DATE',
            daysRemaining: null,
            color: '#6b7280',
            bgColor: '#f3f4f6',
            borderColor: '#d1d5db',
            formattedExpiry: item.expiry_date || 'Not Set'
          };
          byCategory.invalidDate.push(itemObj);
          return itemObj;
        }

        expDate.setHours(23, 59, 59, 999);
        const diffTime = expDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status = 'VALID_OVER_12M';
        let statusLabel = 'VALID (> 12 MONTHS)';
        let color = '#16a34a'; // Green
        let bgColor = '#f0fdf4';
        let borderColor = '#86efac';

        if (daysRemaining < 0) {
          status = 'EXPIRED';
          statusLabel = 'EXPIRED';
          color = '#7f1d1d'; // Dark Red
          bgColor = '#fee2e2';
          borderColor = '#ef4444';
        } else if (daysRemaining <= 90) {
          status = 'EXPIRING_SOON';
          statusLabel = 'EXPIRING SOON (≤ 3M)';
          color = '#dc2626'; // Red
          bgColor = '#fef2f2';
          borderColor = '#fca5a5';
        } else if (daysRemaining <= 180) {
          status = 'EXPIRING_3_6M';
          statusLabel = 'EXPIRING (3–6M)';
          color = '#d97706'; // Orange
          bgColor = '#fffbeb';
          borderColor = '#fcd34d';
        } else if (daysRemaining <= 365) {
          status = 'VALID_6_12M';
          statusLabel = 'VALID (6–12M)';
          color = '#2563eb'; // Blue
          bgColor = '#eff6ff';
          borderColor = '#93c5fd';
        }

        const formattedExpiry = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const itemObj = {
          ...item,
          status,
          statusLabel,
          daysRemaining,
          color,
          bgColor,
          borderColor,
          formattedExpiry
        };

        if (status === 'EXPIRED') byCategory.expired.push(itemObj);
        else if (status === 'EXPIRING_SOON') byCategory.in3Months.push(itemObj);
        else if (status === 'EXPIRING_3_6M') byCategory.in3To6Months.push(itemObj);
        else if (status === 'VALID_6_12M') byCategory.in6To12Months.push(itemObj);
        else byCategory.over12Months.push(itemObj);

        // Add to alarm list if expired or <= 3 months
        if (daysRemaining <= 90) {
          expiringSoonAlarm.push({
            id: item.id,
            name: item.medicine_name,
            batch: item.batch_number || 'N/A',
            qty: item.quantity,
            expiry: item.expiry_date,
            formattedExpiry,
            daysRemaining,
            status,
            statusLabel,
            color
          });
        }

        // Dead Stock Calculation
        const itemName = item.medicine_name ? item.medicine_name.toLowerCase().trim() : '';
        const lastSale = salesMap[itemName];
        const daysSinceSale = lastSale ? (now - lastSale) / (1000 * 60 * 60 * 24) : Infinity;

        if (daysSinceSale > 365) deadStock.notSold1Year.push(item);
        else if (daysSinceSale > 270) deadStock.notSold9Months.push(item);
        else if (daysSinceSale > 180) deadStock.notSold6Months.push(item);
        else if (daysSinceSale > 90) deadStock.notSold3Months.push(item);
        else if (daysSinceSale > 30) deadStock.notSold1Month.push(item);
        else if (daysSinceSale > 7) deadStock.notSold7Days.push(item);

        return itemObj;
      });

      // Sort nearest expiry first
      const validSorted = processedItems
        .filter(i => i.daysRemaining !== null)
        .sort((a, b) => a.daysRemaining - b.daysRemaining);
      const invalidList = processedItems.filter(i => i.daysRemaining === null);
      const allSorted = [...validSorted, ...invalidList];

      // Sort each category by nearest expiry
      Object.keys(byCategory).forEach(cat => {
        if (cat !== 'invalidDate') {
          byCategory[cat].sort((a, b) => a.daysRemaining - b.daysRemaining);
        }
      });
      expiringSoonAlarm.sort((a, b) => a.daysRemaining - b.daysRemaining);

      const summary = {
        expiredCount: byCategory.expired.length,
        in3MonthsCount: byCategory.in3Months.length,
        in3To6MonthsCount: byCategory.in3To6Months.length,
        in6To12MonthsCount: byCategory.in6To12Months.length,
        over12MonthsCount: byCategory.over12Months.length,
        invalidCount: byCategory.invalidDate.length,
        totalMedicines: processedItems.length
      };

      res.json({
        summary,
        allSorted,
        expiringSoon: expiringSoonAlarm,
        byCategory,
        deadStock,
        expiring: {
          expired: byCategory.expired,
          in3Months: byCategory.in3Months,
          in6Months: byCategory.in3To6Months,
          in9Months: byCategory.in6To12Months,
          in12Months: byCategory.in6To12Months
        }
      });
    });
  });
});'''

with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

target_start = "app.get('/api/inventory/analytics'"
target_end = "app.post('/api/expenses'"

start_idx = code.find(target_start)
end_idx = code.find(target_end)

if start_idx != -1 and end_idx != -1:
    new_code = code[:start_idx] + replacement + '\n\n// --- EXPENSE ROUTES ---\n' + code[end_idx:]
    with open('backend/server.js', 'w', encoding='utf-8') as f:
        f.write(new_code)
    print("server.js updated successfully with new expiry analytics route!")
else:
    print("Error: Could not find target slice in server.js")
