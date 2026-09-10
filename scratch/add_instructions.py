import re

with open('mobile/screens/PharmacyBillingScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add updateInstruction function
update_func = """  const updateInstruction = (id, txt) => {
    setCart(cart.map(c => c.id === id ? { ...c, instruction: txt } : c));
  };
"""
if "const updateInstruction" not in code:
    code = code.replace("const removeFromCart = (id) => {", update_func + "\n  const removeFromCart = (id) => {")

# 2. Add instruction field to addToCart
code = code.replace("qty: 1, total: med.mrp }]);", "qty: 1, total: med.mrp, instruction: '' }]);")

# 3. Add instruction to payload
payload_replacement = """        medicines_sold: cart.map(c => ({
          id: c.id,
          medicine_name: c.instruction ? `${c.medicine_name} | ${c.instruction}` : c.medicine_name,
          quantity: c.qty,
          amount: c.total,
          instruction: c.instruction
        }))"""
code = re.sub(r'medicines_sold:\s*cart\.map\(c\s*=>\s*\(\{\s*id:\s*c\.id,\s*medicine_name:\s*c\.medicine_name,\s*quantity:\s*c\.qty,\s*amount:\s*c\.total\s*\}\)\)', payload_replacement, code)

# 4. Update the cart UI rendering
cart_row_old = """            {cart.map((c, i) => (
              <View key={i} style={styles.cartRow}>
                <View style={{flex:1}}>
                  <Text style={styles.cartName}>{c.medicine_name}</Text>
                  <Text style={styles.cartQty}>Qty: {c.qty} x {c.mrp}</Text>
                </View>
                <Text style={styles.cartTotal}>Rs. {c.total}</Text>
                <TouchableOpacity onPress={() => removeFromCart(c.id)} style={{marginLeft: 10}}>
                  <Text style={{color:'red', fontWeight:'bold'}}>X</Text>
                </TouchableOpacity>
              </View>
            ))}"""

cart_row_new = """            {cart.map((c, i) => (
              <View key={i} style={styles.cartItemContainer}>
                <View style={styles.cartRow}>
                  <View style={{flex:1}}>
                    <Text style={styles.cartName}>{c.medicine_name}</Text>
                    <Text style={styles.cartQty}>Qty: {c.qty} x Rs. {c.mrp}</Text>
                  </View>
                  <Text style={styles.cartTotal}>Rs. {c.total}</Text>
                  <TouchableOpacity onPress={() => removeFromCart(c.id)} style={{marginLeft: 15, padding: 5}}>
                    <Text style={{color:'red', fontWeight:'bold', fontSize: 18}}>X</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.instructionInput}
                  placeholder="Usage instructions (e.g. Apply at night)"
                  value={c.instruction}
                  onChangeText={(txt) => updateInstruction(c.id, txt)}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                  {['OD', 'BD', 'TDS', 'Apply at Night', 'Wash after 2 hrs'].map(preset => (
                    <TouchableOpacity key={preset} style={styles.presetChip} onPress={() => updateInstruction(c.id, preset)}>
                      <Text style={styles.presetText}>{preset}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}"""
code = code.replace(cart_row_old, cart_row_new)

# 5. Update generatePDFBill
pdf_rows_old = """    payload.medicines_sold.forEach(m => {
      rows += `<tr><td>${m.medicine_name}</td><td>${m.quantity}</td><td>Rs. ${m.amount}</td></tr>`;
    });"""

pdf_rows_new = """    payload.medicines_sold.forEach(m => {
      let dispName = m.medicine_name;
      if (dispName.includes(' | ')) { dispName = dispName.split(' | ')[0]; }
      
      rows += `<tr>
        <td style="padding: 12px;">
          <strong>${dispName}</strong>
          ${m.instruction ? `<br><span style="color: #555; font-size: 14px; font-style: italic;">Usage: ${m.instruction}</span>` : ''}
        </td>
        <td style="padding: 12px; text-align: center;">${m.quantity}</td>
        <td style="padding: 12px; text-align: right;">Rs. ${m.amount}</td>
      </tr>`;
    });"""
code = code.replace(pdf_rows_old, pdf_rows_new)

# 6. Update the PDF HTML template (Theme, Logo, Go Green)
html_old = """          <head>
            <style>
              body { font-family: 'Helvetica'; padding: 40px; color: #333; }
              h1 { color: #5C0B0B; text-align: center; margin-bottom: 5px; }
              h2 { color: #333; text-align: center; margin-top: 0; font-size: 20px; }
              h3 { text-align: center; color: #666; margin-top: 5px; }
              .details { margin-top: 30px; font-size: 16px; }
              table { width: 100%; margin-top: 30px; border-collapse: collapse; }
              th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
              th { background-color: #f5f5f5; }
              .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; color: #5C0B0B; }
              .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
            </style>
          </head>
          <body>
            <div style="text-align: center;">
              <h1 style="font-size: 28px;">SKINSSENCE CLINIC</h1>
              <h2>Dr. Ashima Madan</h2>
              <h3>Pharmacy Bill / Tax Invoice</h3>
            </div>"""

html_new = """          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #222; }
              .header-container { text-align: center; border-bottom: 2px solid #5C0B0B; padding-bottom: 20px; margin-bottom: 20px; }
              h1 { color: #5C0B0B; margin-bottom: 5px; font-size: 32px; letter-spacing: 1px; }
              h2 { color: #444; margin-top: 0; font-size: 18px; font-weight: 500; }
              h3 { color: #777; margin-top: 10px; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
              .details { margin-top: 20px; font-size: 15px; line-height: 1.6; }
              table { width: 100%; margin-top: 30px; border-collapse: collapse; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
              th, td { border: 1px solid #e0e0e0; padding: 12px; text-align: left; }
              th { background-color: #5C0B0B; color: white; font-weight: bold; text-transform: uppercase; font-size: 14px; }
              .total-row { background-color: #f9f9f9; font-size: 18px; font-weight: bold; }
              .footer { margin-top: 60px; text-align: center; font-size: 13px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
              .go-green { color: #2e7d32; font-weight: bold; margin-top: 15px; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="header-container">
              <h1>SKINSSENCE CLINIC</h1>
              <h2>Dr. Ashima Madan | Skin & Hair Expert</h2>
              <h3>Pharmacy Bill / Tax Invoice</h3>
            </div>"""
code = code.replace(html_old, html_new)

# Table headers inside HTML
table_old = """              <table>
                <tr><th>Medicine</th><th>Quantity</th><th>Amount</th></tr>
                ${rows}
              </table>"""

table_new = """              <table>
                <tr><th>Medicine & Instructions</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Total Amount</th></tr>
                ${rows}
                <tr class="total-row">
                  <td colspan="2" style="text-align: right; padding: 15px;">Grand Total (${payload.payment_mode}):</td>
                  <td style="text-align: right; padding: 15px; color: #5C0B0B;">Rs. ${payload.amount_received}</td>
                </tr>
              </table>"""
code = code.replace(table_old, table_new)

footer_old = """<div class="total">Total Paid (${payload.payment_mode}): Rs. ${payload.amount_received}</div>
            
            <div class="footer">
              Thank you for visiting Skinssence Clinic.<br>
              Get well soon!
            </div>"""

footer_new = """            <div class="footer">
              <p>Thank you for visiting Skinssence Clinic. We wish you a speedy recovery!</p>
              <p class="go-green">🌿 Go Green! Thank you for choosing a digital e-receipt to save paper.</p>
            </div>"""
code = code.replace(footer_old, footer_new)

# 7. Add styles for instruction input and preset chips
styles_old = """    checkoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
  });"""

styles_new = """    checkoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    cartItemContainer: { borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10, width: '100%' },
    instructionInput: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 13, marginTop: 5 },
    presetScroll: { flexDirection: 'row', marginTop: 8 },
    presetChip: { backgroundColor: '#e3f2fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8, borderWidth: 1, borderColor: '#bbdefb' },
    presetText: { color: '#0d47a1', fontSize: 12, fontWeight: '500' }
  });"""
code = code.replace(styles_old, styles_new)

with open('mobile/screens/PharmacyBillingScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)
