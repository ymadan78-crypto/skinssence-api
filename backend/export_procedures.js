const { createClient } = require('@libsql/client');
require('dotenv').config();
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const XLSX = require('xlsx');
const path = require('path');
const os = require('os');

async function main() {
  // Get column info
  const cols = await db.execute("PRAGMA table_info(master_procedures)");
  console.log("COLUMNS:", cols.rows.map(c => c.name).join(', '));

  // Get all procedures
  const result = await db.execute("SELECT * FROM master_procedures ORDER BY category, name");
  console.log("TOTAL ROWS:", result.rows.length);
  console.log("SAMPLE:", JSON.stringify(result.rows.slice(0, 3), null, 2));

  // Create Excel
  const rows = result.rows.map(r => ({
    ID: r.id,
    Name: r.name,
    Category: r.category,
    'Default Price (₹)': r.default_price ?? r.price ?? r.cost ?? '',
    Description: r.description ?? '',
    'Duration (min)': r.duration_minutes ?? r.duration ?? '',
    'Is Active': r.is_active ?? r.active ?? '',
    'Created At': r.created_at ?? '',
    Notes: r.notes ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // ID
    { wch: 35 }, // Name
    { wch: 25 }, // Category
    { wch: 18 }, // Price
    { wch: 40 }, // Description
    { wch: 15 }, // Duration
    { wch: 12 }, // Is Active
    { wch: 20 }, // Created At
    { wch: 30 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Master Procedures');

  const desktopPath = path.join(os.homedir(), 'Desktop', 'Master_Procedures.xlsx');
  XLSX.writeFile(wb, desktopPath);
  console.log('SUCCESS: Saved to', desktopPath);
}
main().catch(e => console.error('ERR:', e.message, e.stack));
