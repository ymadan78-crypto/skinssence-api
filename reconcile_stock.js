const fs = require('fs');
const path = require('path');
const db = require('./db.js');
const { findDefaultStockFile, parseStockFile, generatePreview } = require('./stockReconciliation.js');

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const customFileArg = args.find(a => !a.startsWith('--'));

  const filePath = customFileArg || findDefaultStockFile();
  if (!filePath) {
    console.error('ERROR: No stock summary file found! Please provide path to Excel or CSV file.');
    process.exit(1);
  }

  console.log('===============================================================');
  console.log('      SKINSSENCE LIVE STOCK RECONCILIATION ENGINE              ');
  console.log('===============================================================');
  console.log(`Source File: ${filePath}`);
  console.log(`Mode:        ${isCommit ? 'COMMIT (APPLY TO DATABASE)' : 'PREVIEW ONLY (DRY RUN)'}`);
  console.log('---------------------------------------------------------------');

  const fileItems = parseStockFile(filePath);
  console.log(`Successfully parsed ${fileItems.length} articles from source file.`);

  db.all('SELECT * FROM inventory', [], async (err, currentInv) => {
    if (err) {
      console.error('Failed to query inventory:', err);
      process.exit(1);
    }

    console.log(`Current active inventory in database: ${currentInv.length} records.\n`);

    const result = generatePreview(fileItems, currentInv);
    const { summary, comparison } = result;

    console.log('--- RECONCILIATION SUMMARY ---');
    console.log(`Total File Articles:     ${summary.total_items_in_file}`);
    console.log(`Positive Balance Items:  ${summary.positive_balance_items}`);
    console.log(`Action: Replace/Override: ${summary.items_replaced}`);
    console.log(`Action: New Stock Added:  ${summary.items_added}`);
    console.log(`Action: Set to 0:         ${summary.items_zeroed}`);
    console.log(`Action: Unchanged:        ${summary.items_unchanged}`);
    console.log(`Action: Skipped (Zeroes): ${summary.items_skipped}`);
    console.log(`Final Physical Stock Qty: ${summary.total_stock_count} units\n`);

    // Group comparison by action for clear preview
    const toShow = comparison.filter(c => c.action !== 'Unchanged');
    console.log(`--- PREVIEW TABLE (Showing ${Math.min(toShow.length, 30)} of ${toShow.length} changes) ---`);
    console.table(toShow.slice(0, 30).map(r => ({
      Medicine: r.medicine.substring(0, 24),
      Batch: r.batch.substring(0, 14),
      'Existing Stock': r.existing_stock,
      'Excel Balance': r.excel_balance,
      'Final Stock': r.final_stock,
      Adjustment: (r.adjustment > 0 ? '+' : '') + r.adjustment,
      Action: r.action
    })));

    if (!isCommit) {
      console.log('\n[INFO] Dry-run complete. No database changes were made.');
      console.log('To apply these stock overrides permanently to Turso DB, run:');
      console.log('  node backend/reconcile_stock.js --commit\n');
      setTimeout(() => process.exit(0), 500);
      return;
    }

    // COMMIT MODE
    console.log('\n--- COMMITTING LIVE STOCK RECONCILIATION TO DATABASE ---');
    const recCode = `REC-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
    const fileName = path.basename(filePath);
    const importedBy = 'Admin / Live Stock Import';

    db.run(
      `INSERT INTO stock_reconciliations (reconciliation_code, file_name, total_items_in_file, items_replaced, items_added, items_zeroed, items_unchanged, total_stock_count, imported_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recCode,
        fileName,
        summary.total_items_in_file,
        summary.items_replaced,
        summary.items_added,
        summary.items_zeroed,
        summary.items_unchanged,
        summary.total_stock_count,
        importedBy,
        'Live actual stock replacement override'
      ],
      function (errRec) {
        if (errRec) {
          console.error('Error inserting stock_reconciliations:', errRec);
          process.exit(1);
        }

        const reconciliationId = this.lastID;
        console.log(`Created Reconciliation Record #${reconciliationId} (${recCode})`);

        let pending = comparison.length;
        if (pending === 0) {
          console.log('Nothing to update.');
          process.exit(0);
        }

        const onComplete = () => {
          console.log('\n===============================================================');
          console.log('  SUCCESS: LIVE STOCK RECONCILIATION APPLIED TO DATABASE!      ');
          console.log('===============================================================');
          console.log(`Reconciliation ID: #${reconciliationId} (${recCode})`);
          console.log(`Total Final Units in Inventory: ${summary.total_stock_count}`);
          console.log('All quantities strictly overridden by Excel balance.');
          console.log('Audit log stored in stock_adjustments.');
          console.log('Zero financial entries created (expenses/collections unaffected).\n');
          setTimeout(() => process.exit(0), 500);
        };

        comparison.forEach(item => {
          if (item.action === 'Replace') {
            db.run(
              `UPDATE inventory SET quantity = ?, mrp = CASE WHEN ? > 0 THEN ? ELSE mrp END, expiry_date = CASE WHEN ? != '' THEN ? ELSE expiry_date END WHERE id = ?`,
              [item.final_stock, item.mrp || 0, item.mrp || 0, item.expiry_date || '', item.expiry_date || '', item.db_id],
              (updErr) => {
                db.run(
                  `INSERT INTO stock_adjustments (reconciliation_id, inventory_id, medicine_name, batch_number, previous_stock, new_stock, adjustment, action, reason, source, imported_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'REPLACE', 'Live Stock Reconciliation', ?, ?)`,
                  [reconciliationId, item.db_id, item.medicine, item.batch, item.existing_stock, item.final_stock, item.adjustment, fileName, importedBy]
                );
                pending--;
                if (pending === 0) onComplete();
              }
            );
          } else if (item.action === 'Add') {
            db.run(
              `INSERT INTO inventory (medicine_name, batch_number, mrp, quantity, expiry_date) VALUES (?, ?, ?, ?, ?)`,
              [item.medicine, item.batch === '-' ? '' : item.batch, item.mrp || 0, item.final_stock, item.expiry_date || ''],
              function (insErr) {
                const newId = this ? this.lastID : null;
                db.run(
                  `INSERT INTO stock_adjustments (reconciliation_id, inventory_id, medicine_name, batch_number, previous_stock, new_stock, adjustment, action, reason, source, imported_by)
                   VALUES (?, ?, ?, ?, 0, ?, ?, 'ADD', 'Live Stock Reconciliation', ?, ?)`,
                  [reconciliationId, newId, item.medicine, item.batch, item.final_stock, item.adjustment, fileName, importedBy]
                );
                pending--;
                if (pending === 0) onComplete();
              }
            );
          } else if (item.action.startsWith('Set to 0')) {
            db.run(
              `UPDATE inventory SET quantity = 0 WHERE id = ?`,
              [item.db_id],
              (zeroErr) => {
                db.run(
                  `INSERT INTO stock_adjustments (reconciliation_id, inventory_id, medicine_name, batch_number, previous_stock, new_stock, adjustment, action, reason, source, imported_by)
                   VALUES (?, ?, ?, ?, ?, 0, ?, 'SET_ZERO', 'Live Stock Reconciliation', ?, ?)`,
                  [reconciliationId, item.db_id, item.medicine, item.batch, item.existing_stock, item.adjustment, fileName, importedBy]
                );
                pending--;
                if (pending === 0) onComplete();
              }
            );
          } else {
            // Unchanged
            pending--;
            if (pending === 0) onComplete();
          }
        });
      }
    );
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
