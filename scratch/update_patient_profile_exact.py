with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update lines 216-218 in invoice generation
old_inv_block = """    const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
    const grandTotal = procTotal + medTotal;"""

new_inv_block = """    const cFee = parseFloat(visit.consultation_fee) || 0;
    const cFeeRow = cFee > 0 ? `
      <tr>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px">🩺 <strong>Consultation Fee</strong></td>
        <td style="padding:10px;text-align:center">1</td>
        <td style="padding:10px;text-align:right">Rs. ${cFee.toFixed(2)}</td>
      </tr>` : '';

    const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
    const grandTotal = cFee + procTotal + medTotal;"""

code = code.replace(old_inv_block, new_inv_block)

# 2. Update line 569 in history mapping
old_map_block = """            const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const payTotal = (visit.payments || []).reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);
            const grandTotal = procTotal + medTotal;"""

new_map_block = """            const cFee = parseFloat(visit.consultation_fee) || 0;
            const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const payTotal = (visit.payments || []).reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);
            const grandTotal = cFee + procTotal + medTotal;"""

code = code.replace(old_map_block, new_map_block)

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("PatientProfileScreen.js successfully updated with invoice and history calculations!")
