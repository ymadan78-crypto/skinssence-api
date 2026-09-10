const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function normalize(s) {
  if (!s) return '';
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Locate default stock file if none specified
function findDefaultStockFile() {
  const candidates = [
    'C:/Users/pc/Downloads/skinssence_laser_and_skincare_clinic_stock_summary.xlsx',
    'C:/Users/pc/Downloads/skinssence_laser_and_skincare_clinic_stock_summary.csv',
    'C:/Users/pc/Desktop/skinssence_laser_and_skincare_clinic_stock_summary.xlsx',
    'C:/Users/pc/Desktop/skinssence_laser_and_skincare_clinic_stock_summary.csv',
    'C:/Users/pc/Desktop/Upload_Bills_Here/skinssence_laser_and_skincare_clinic_stock_summary.xlsx',
    'C:/Users/pc/Desktop/Upload_Bills_Here/skinssence_laser_and_skincare_clinic_stock_summary.csv',
    path.join(__dirname, '../data/skinssence_laser_and_skincare_clinic_stock_summary.csv')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Parse Excel or CSV buffer/filepath into normalized rows
function parseStockFile(fileSource) {
  let wb;
  if (Buffer.isBuffer(fileSource)) {
    wb = xlsx.read(fileSource, { type: 'buffer' });
  } else if (typeof fileSource === 'string' && fs.existsSync(fileSource)) {
    wb = xlsx.readFile(fileSource);
  } else {
    throw new Error('Stock file not found or invalid format: ' + fileSource);
  }

  const sheetName = wb.SheetNames[0];
  const rawRows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const row = rawRows[i];
    if (row && Array.isArray(row)) {
      const rowStr = row.map(c => String(c || '')).join(' ');
      if (/name/i.test(rowStr) && (/stock/i.test(rowStr) || /quantity/i.test(rowStr) || /batch/i.test(rowStr))) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) {
    throw new Error('Could not find header row containing Name and Stock Quantity');
  }

  const headerRow = rawRows[headerIdx] || [];
  const nameIndices = [];
  const batchIndices = [];
  const qtyIndices = [];
  const sellIndices = [];
  const mrpIndices = [];
  const expIndices = [];

  headerRow.forEach((h, idx) => {
    const s = String(h || '').trim().toLowerCase();
    if (s === 'name' || s.includes('medicine') || s.includes('item name')) nameIndices.push(idx);
    if (s.includes('batch')) batchIndices.push(idx);
    if (s.includes('stock quantity') || s.includes('quantity') || s.includes('qty') || s.includes('balance')) qtyIndices.push(idx);
    if (s.includes('selling') || s.includes('rate')) sellIndices.push(idx);
    if (s.includes('mrp')) mrpIndices.push(idx);
    if (s.includes('exp')) expIndices.push(idx);
  });

  if (nameIndices.length === 0) {
    throw new Error('Could not locate Medicine Name column');
  }

  const items = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    // Get name
    let name = '';
    for (const idx of nameIndices) {
      if (row[idx]) {
        name = String(row[idx]).trim();
        break;
      }
    }
    if (!name) continue;

    // Get batch
    let batch = '';
    for (const idx of batchIndices) {
      if (row[idx] && String(row[idx]).trim()) {
        batch = String(row[idx]).trim();
        break;
      }
    }

    // Get quantity
    let qty = 0;
    for (const idx of qtyIndices) {
      if (row[idx] !== undefined && row[idx] !== null && String(row[idx]).trim() !== '') {
        const rawQty = String(row[idx]).replace(/pcs/gi, '').replace(/\s+/g, '').trim();
        const parsed = parseInt(parseFloat(rawQty) || 0, 10);
        qty = parsed;
        break;
      }
    }

    // Get selling price & mrp
    let sellPrice = 0;
    for (const idx of sellIndices) {
      if (row[idx]) {
        sellPrice = parseFloat(row[idx]) || 0;
        break;
      }
    }
    let mrp = sellPrice;
    for (const idx of mrpIndices) {
      const v = parseFloat(row[idx]) || 0;
      if (v > 0) {
        mrp = v;
        break;
      }
    }

    // Get expiry
    let exp = '';
    for (const idx of expIndices) {
      if (row[idx] && String(row[idx]).trim()) {
        exp = String(row[idx]).trim();
        break;
      }
    }

    items.push({
      name,
      batch,
      qty,
      mrp: mrp > 0 ? mrp : sellPrice,
      expiry_date: exp
    });
  }

  return items;
}

// Generate comparison preview against current database inventory
function generatePreview(fileItems, currentDbInventory) {
  const invByKey = new Map();
  const invByName = new Map();

  currentDbInventory.forEach(item => {
    const k = `${normalize(item.medicine_name)}:::${normalize(item.batch_number)}`;
    invByKey.set(k, item);

    const nk = normalize(item.medicine_name);
    if (!invByName.has(nk)) invByName.set(nk, []);
    invByName.get(nk).push(item);
  });

  const matchedDbIds = new Set();
  const comparison = [];

  let countReplace = 0;
  let countAdd = 0;
  let countZero = 0;
  let countUnchanged = 0;
  let countSkip = 0;
  let totalStockCount = 0;

  fileItems.forEach(fi => {
    const exactKey = `${normalize(fi.name)}:::${normalize(fi.batch)}`;
    let matchedItem = invByKey.get(exactKey);

    // If no exact match on batch, check if there's only 1 db item for this medicine
    if (!matchedItem) {
      const byName = invByName.get(normalize(fi.name));
      if (byName && byName.length === 1 && !matchedDbIds.has(byName[0].id)) {
        if (!byName[0].batch_number || !fi.batch || normalize(byName[0].batch_number) === normalize(fi.batch)) {
          matchedItem = byName[0];
        }
      }
    }

    if (matchedItem) {
      matchedDbIds.add(matchedItem.id);
      const existingStock = matchedItem.quantity || 0;
      const excelBalance = fi.qty;

      if (excelBalance > 0) {
        totalStockCount += excelBalance;
        if (existingStock !== excelBalance) {
          countReplace++;
          comparison.push({
            medicine: fi.name,
            batch: fi.batch || matchedItem.batch_number || '-',
            existing_stock: existingStock,
            excel_balance: excelBalance,
            final_stock: excelBalance, // STRICT OVERRIDE
            action: 'Replace',
            adjustment: excelBalance - existingStock,
            mrp: fi.mrp || matchedItem.mrp,
            expiry_date: fi.expiry_date || matchedItem.expiry_date,
            db_id: matchedItem.id
          });
        } else {
          countUnchanged++;
          comparison.push({
            medicine: fi.name,
            batch: fi.batch || matchedItem.batch_number || '-',
            existing_stock: existingStock,
            excel_balance: excelBalance,
            final_stock: excelBalance,
            action: 'Unchanged',
            adjustment: 0,
            mrp: fi.mrp || matchedItem.mrp,
            expiry_date: fi.expiry_date || matchedItem.expiry_date,
            db_id: matchedItem.id
          });
        }
      } else {
        // Excel balance is <= 0: Zero out if active in DB, otherwise skip
        if (existingStock > 0) {
          countZero++;
          comparison.push({
            medicine: fi.name,
            batch: fi.batch || matchedItem.batch_number || '-',
            existing_stock: existingStock,
            excel_balance: 0,
            final_stock: 0,
            action: 'Set to 0',
            adjustment: -existingStock,
            mrp: fi.mrp || matchedItem.mrp,
            expiry_date: fi.expiry_date || matchedItem.expiry_date,
            db_id: matchedItem.id
          });
        } else {
          countSkip++;
        }
      }
    } else {
      // Not in DB
      if (fi.qty > 0) {
        countAdd++;
        totalStockCount += fi.qty;
        comparison.push({
          medicine: fi.name,
          batch: fi.batch || '-',
          existing_stock: 0,
          excel_balance: fi.qty,
          final_stock: fi.qty, // STRICT OVERRIDE
          action: 'Add',
          adjustment: fi.qty,
          mrp: fi.mrp,
          expiry_date: fi.expiry_date
        });
      } else {
        countSkip++;
      }
    }
  });

  // Check existing DB items absent from the file (Rule 4: set to 0, do not delete)
  currentDbInventory.forEach(item => {
    if (!matchedDbIds.has(item.id)) {
      if (item.quantity > 0) {
        countZero++;
        comparison.push({
          medicine: item.medicine_name,
          batch: item.batch_number || '-',
          existing_stock: item.quantity,
          excel_balance: 0,
          final_stock: 0,
          action: 'Set to 0 (Absent)',
          adjustment: -item.quantity,
          mrp: item.mrp,
          expiry_date: item.expiry_date,
          db_id: item.id
        });
      }
    }
  });

  return {
    summary: {
      total_items_in_file: fileItems.length,
      positive_balance_items: fileItems.filter(f => f.qty > 0).length,
      items_replaced: countReplace,
      items_added: countAdd,
      items_zeroed: countZero,
      items_unchanged: countUnchanged,
      items_skipped: countSkip,
      total_stock_count: totalStockCount
    },
    comparison
  };
}

module.exports = {
  findDefaultStockFile,
  parseStockFile,
  generatePreview
};
