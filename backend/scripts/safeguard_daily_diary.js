const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../mobile/screens/DailyDiaryScreen.js');
let content = fs.readFileSync(filePath, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add formatCurrency helper right near formatDateToYMD
const targetHelper = `  // Helper to format Date to YYYY-MM-DD
  const formatDateToYMD = (dateObj) => {`;

const replaceHelper = `  // Safe currency / number formatter
  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '0';
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Helper to format Date to YYYY-MM-DD
  const formatDateToYMD = (dateObj) => {`;

content = content.replace(targetHelper, replaceHelper);

// 2. Safe timeline item amount
content = content.replace(
  `{item.amount !== null && item.amount !== undefined ? (
            <Text style={[styles.entryAmount, item.is_debit ? styles.debitAmount : styles.creditAmount]}>
              {item.is_debit ? '-' : ''}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </Text>
          ) : null}`,
  `{item.amount !== null && item.amount !== undefined ? (
            <Text style={[styles.entryAmount, item.is_debit ? styles.debitAmount : styles.creditAmount]}>
              {item.is_debit ? '-' : ''}₹{formatCurrency(item.amount)}
            </Text>
          ) : null}`
);

// 3. Safe badge_color
content = content.replace(
  `<View style={[styles.categoryBadge, { backgroundColor: item.badge_color ? \`\${item.badge_color}18\` : '#f1f5f9' }]}>`,
  `<View style={[styles.categoryBadge, { backgroundColor: (item.badge_color && item.badge_color.startsWith('#') && item.badge_color.length === 7) ? \`\${item.badge_color}18\` : '#f1f5f9' }]}>`
);

// 4. Safe financial card
content = content.replace(
  `<Text style={styles.finValBilled}>₹{summary.total_sales.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.finValBilled}>₹{formatCurrency(summary?.total_sales)}</Text>`
);
content = content.replace(
  `<Text style={styles.finValCollected}>₹{summary.total_collection.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.finValCollected}>₹{formatCurrency(summary?.total_collection)}</Text>`
);
content = content.replace(
  `<Text style={styles.finValExpense}>₹{summary.total_expenses.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.finValExpense}>₹{formatCurrency(summary?.total_expenses)}</Text>`
);
content = content.replace(
  `{summary.net_balance >= 0 ? '+' : ''}₹{summary.net_balance.toLocaleString('en-IN')}`,
  `{parseFloat(summary?.net_balance || 0) >= 0 ? '+' : ''}₹{formatCurrency(summary?.net_balance)}`
);

// 5. Safe mode chips
content = content.replace(
  `{mode}: ₹{amt.toLocaleString('en-IN')}`,
  `{mode}: ₹{formatCurrency(amt)}`
);

// 6. Safe operational cards
content = content.replace(
  `<Text style={styles.opVal}>₹{summary.consultation_revenue.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.opVal}>₹{formatCurrency(summary?.consultation_revenue)}</Text>`
);
content = content.replace(
  `<Text style={styles.opVal}>₹{summary.procedure_revenue.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.opVal}>₹{formatCurrency(summary?.procedure_revenue)}</Text>`
);
content = content.replace(
  `<Text style={styles.opVal}>₹{summary.medicine_revenue.toLocaleString('en-IN')}</Text>`,
  `<Text style={styles.opVal}>₹{formatCurrency(summary?.medicine_revenue)}</Text>`
);

// 7. Update DailyDiaryErrorBoundary to display error details
content = content.replace(
  `          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
            An unexpected error occurred while loading this date\\'s timeline. The screen was safely kept from going blank.
          </Text>`,
  `          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 12, lineHeight: 18 }}>
            An unexpected error occurred while loading this date's timeline.
          </Text>
          {this.state.error ? (
            <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', padding: 10, borderRadius: 8, marginBottom: 20, width: '100%' }}>
              <Text style={{ fontSize: 12, color: '#991b1b', fontWeight: 'bold', textAlign: 'center' }}>
                {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
              </Text>
            </View>
          ) : null}`
);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('DailyDiaryScreen.js updated with safe formatting and error display!');
