with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update Invoice generation logic
old_invoice_proc = """    const procRows = (visit.procedures || []).map((p, i) => `
      <tr>
        <td style="padding:10px;text-align:center">${i + 1}</td>
        <td style="padding:10px">
          <strong>${p.name}</strong>
          ${p.area ? `<br><span style="color:#555;font-size:12px">Area: ${p.area}</span>` : ''}
          ${p.notes ? `<br><span style="color:#777;font-size:12px;font-style:italic">${p.notes}</span>` : ''}
        </td>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px;text-align:right">Rs. ${parseFloat(p.amount)||0}</td>
      </tr>`).join('');

    const medRows = (visit.medicines || []).map((m, i) => `
      <tr style="background:#fafafa">
        <td style="padding:10px;text-align:center">${(visit.procedures||[]).length + i + 1}</td>
        <td style="padding:10px">💊 <strong>${m.details}</strong></td>
        <td style="padding:10px;text-align:center">—</td>
        <td style="padding:10px;text-align:right">Rs. ${parseFloat(m.amount)||0}</td>
      </tr>`).join('');

    const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
    const grandTotal = procTotal + medTotal;"""

new_invoice_proc = """    const cFee = parseFloat(visit.consultation_fee) || 0;
    const cFeeRow = cFee > 0 ? `
      <tr>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px">🩺 <strong>Consultation Fee</strong></td>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px;text-align:right">Rs. ${cFee.toFixed(2)}</td>
      </tr>` : '';

    const procOffset = cFee > 0 ? 1 : 0;
    const procRows = (visit.procedures || []).map((p, i) => `
      <tr>
        <td style="padding:10px;text-align:center">${i + 1 + procOffset}</td>
        <td style="padding:10px">
          <strong>${p.name}</strong>
          ${p.area ? `<br><span style="color:#555;font-size:12px">Area: ${p.area}</span>` : ''}
          ${p.notes ? `<br><span style="color:#777;font-size:12px;font-style:italic">${p.notes}</span>` : ''}
        </td>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px;text-align:right">Rs. ${(parseFloat(p.amount)||0).toFixed(2)}</td>
      </tr>`).join('');

    const medOffset = (visit.procedures || []).length + procOffset;
    const medRows = (visit.medicines || []).map((m, i) => `
      <tr style="background:#fafafa">
        <td style="padding:10px;text-align:center">${i + 1 + medOffset}</td>
        <td style="padding:10px">💊 <strong>${m.details}</strong></td>
        <td style="padding:10px;text-align:center">—</td>
        <td style="padding:10px;text-align:right">Rs. ${(parseFloat(m.amount)||0).toFixed(2)}</td>
      </tr>`).join('');

    const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
    const grandTotal = cFee + procTotal + medTotal;"""

if old_invoice_proc in code:
    code = code.replace(old_invoice_proc, new_invoice_proc)
    print("Updated invoice generation in PatientProfileScreen.js!")
else:
    print("Warning: old_invoice_proc pattern not matched exactly!")

# 2. Update tbody in invoice
code = code.replace("<tbody>\n              ${procRows}\n              ${medRows}\n            </tbody>",
                    "<tbody>\n              ${cFeeRow}\n              ${procRows}\n              ${medRows}\n            </tbody>")

# 3. Update Visit History card rendering in PatientProfileScreen.js
old_history_card = """            const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const grandTotal = procTotal + medTotal;"""

new_history_card = """            const cFee = parseFloat(visit.consultation_fee) || 0;
            const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const grandTotal = cFee + procTotal + medTotal;"""

if old_history_card in code:
    code = code.replace(old_history_card, new_history_card)
    print("Updated history card totals in PatientProfileScreen.js!")
else:
    print("Warning: old_history_card not matched!")

# 4. Render Consultation Fee line item in History list
old_history_section = """                    {/* Procedures / Consultation */}
                    {!isPharmacyOnly && (visit.procedures || []).length > 0 && (
                      <>
                        <Text style={styles.historySection}>🩺 Consultation & Procedures</Text>
                        {(visit.procedures || []).map((p, pIdx) => ("""

new_history_section = """                    {/* Consultation Fee & Procedures */}
                    {!isPharmacyOnly && (cFee > 0 || (visit.procedures || []).length > 0) && (
                      <>
                        <Text style={styles.historySection}>🩺 Consultation & Procedures</Text>
                        {cFee > 0 && (
                          <View style={styles.historyLineItem}>
                            <View style={{flex: 1}}>
                              <Text style={styles.historyLineName}>🩺 Consultation Fee</Text>
                            </View>
                            <Text style={styles.historyLineAmt}>Rs. {cFee.toFixed(0)}</Text>
                          </View>
                        )}
                        {(visit.procedures || []).map((p, pIdx) => ("""

if old_history_section in code:
    code = code.replace(old_history_section, new_history_section)
    print("Updated history line item rendering in PatientProfileScreen.js!")
else:
    print("Warning: old_history_section not matched!")

# 5. Summary box in History list: add consultation fee
old_sum_box = """                    {/* Financial Breakdown Summary Box */}
                    <View style={styles.historySummaryBox}>
                      {procTotal > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Procedures Total</Text>
                          <Text style={styles.summaryValue}>Rs. {procTotal.toFixed(0)}</Text>
                        </View>
                      )}"""

new_sum_box = """                    {/* Financial Breakdown Summary Box */}
                    <View style={styles.historySummaryBox}>
                      {cFee > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Consultation Fee</Text>
                          <Text style={styles.summaryValue}>Rs. {cFee.toFixed(0)}</Text>
                        </View>
                      )}
                      {procTotal > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Procedures Total</Text>
                          <Text style={styles.summaryValue}>Rs. {procTotal.toFixed(0)}</Text>
                        </View>
                      )}"""

if old_sum_box in code:
    code = code.replace(old_sum_box, new_sum_box)
    print("Updated summary box in PatientProfileScreen.js!")
else:
    print("Warning: old_sum_box not matched!")

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("PatientProfileScreen.js updated successfully!")
