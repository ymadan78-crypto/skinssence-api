import re

# CLINIC CONSTANTS for the PDF bill
CLINIC_HEADER = """
  <div class="header-container">
    <div class="logo-area">
      <div style="width:80px;height:80px;background:#5C0B0B;border-radius:40px;display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:32px;font-weight:bold;">S</span>
      </div>
    </div>
    <div class="clinic-details">
      <h1>SKINSSENCE LASER AND SKINCARE CLINIC</h1>
      <p class="doc">Dr. Ashima Madan | MBBS, MD, FAM – DJPIMAC, Mumbai</p>
      <p class="addr">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
      <p class="addr">Phone: 095091 97578 &nbsp;|&nbsp; www.skinssence.in</p>
    </div>
    <div class="bill-type">RECEIPT / TAX INVOICE</div>
  </div>
"""

with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# ============================================================
# 1. Add expandedVisit state near top of component
# ============================================================
code = code.replace(
    "const [pkgName, setPkgName] = useState('');",
    "const [pkgName, setPkgName] = useState('');\n  const [expandedVisitId, setExpandedVisitId] = useState(null);"
)

# ============================================================
# 2. Replace the visit history map rendering block with fully expanded card
# ============================================================
OLD_HISTORY = """          history.map((visit, index) => (
            <View key={visit.visit_id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>{new Date(visit.created_at).toLocaleDateString()}</Text>
                <Text style={styles.historyDoctor}>Dr. {visit.doctor_name}</Text>
              </View>
              
              {visit.procedures.map(p => (
                <View key={p.id}><Text style={styles.historyItem}>💊 Procedure: {p.name}{p.area ? ` (${p.area})` : ''} (₹{p.amount})</Text>{p.notes ? <Text style={[styles.historyItem, {marginLeft: 15, fontStyle: 'italic', color: '#6b7280'}]}>Notes: {p.notes}</Text> : null}</View>
              ))}
              
              {visit.medicines.map(m => (
                <Text key={m.id} style={styles.historyItem}>💉 Medicine: {m.details} (₹{m.amount})</Text>
              ))}
              
              {visit.planned_procedures ? (
                <Text style={styles.historyAdvice}>Advice: {visit.planned_procedures}</Text>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
                <TouchableOpacity style={[styles.receiptBtn, { flex: 1, marginRight: 10, marginTop: 0 }]} onPress={() => printReceipt(visit)}>
                  <Text style={styles.receiptBtnText}>🖨️ Generate PDF Receipt</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.receiptBtn, { backgroundColor: '#ef4444', flex: 0, paddingHorizontal: 15, marginTop: 0 }]} 
                  onPress={() => deleteVisit(visit.visit_id)}>
                  <Text style={styles.receiptBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))"""

NEW_HISTORY = """          history.map((visit, index) => {
            const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
            const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
            const payTotal = (visit.payments || []).reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);
            const grandTotal = procTotal + medTotal;
            const isExpanded = expandedVisitId === visit.visit_id;
            const isPharmacyOnly = visit.planned_procedures === 'PHARMACY SALE';
            return (
              <View key={visit.visit_id} style={styles.historyCard}>
                {/* COMPACT HEADER - always visible */}
                <TouchableOpacity onPress={() => setExpandedVisitId(isExpanded ? null : visit.visit_id)} style={styles.historyHeaderTouchable}>
                  <View style={styles.historyHeaderRow}>
                    <View>
                      <Text style={styles.historyDate}>{new Date(visit.created_at).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</Text>
                      <Text style={styles.historyDoctor}>{isPharmacyOnly ? '💊 Pharmacy Sale' : `🏥 Dr. ${visit.doctor_name}`}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                      <Text style={styles.historyGrandTotal}>Rs. {grandTotal.toFixed(0)}</Text>
                      <Text style={styles.historyPaid}>Paid: Rs. {payTotal.toFixed(0)}</Text>
                    </View>
                    <Text style={{color:'#5C0B0B', fontWeight:'bold', fontSize:18, marginLeft:10}}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* EXPANDED SECTION */}
                {isExpanded && (
                  <View style={styles.historyExpanded}>
                    <View style={{height:1, backgroundColor:'#eee', marginVertical:12}} />

                    {/* Consultation Fee line if exists */}
                    {!isPharmacyOnly && (
                      <Text style={styles.historySection}>🩺 Visit Details</Text>
                    )}

                    {(visit.procedures || []).map(p => (
                      <View key={p.id} style={styles.historyLineItem}>
                        <View style={{flex:1}}>
                          <Text style={styles.historyLineName}>{p.name}{p.area ? ` — ${p.area}` : ''}</Text>
                          {p.notes ? <Text style={styles.historyLineNote}>Notes: {p.notes}</Text> : null}
                        </View>
                        <Text style={styles.historyLineAmt}>Rs. {(parseFloat(p.amount)||0).toFixed(0)}</Text>
                      </View>
                    ))}

                    {(visit.medicines || []).length > 0 && (
                      <>
                        <Text style={styles.historySection}>💊 Pharmacy / Medicines</Text>
                        {visit.medicines.map(m => (
                          <View key={m.id} style={styles.historyLineItem}>
                            <Text style={[styles.historyLineName, {flex:1}]}>{m.details}</Text>
                            <Text style={styles.historyLineAmt}>Rs. {(parseFloat(m.amount)||0).toFixed(0)}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {visit.planned_procedures && !isPharmacyOnly ? (
                      <View style={styles.historyAdviceBox}>
                        <Text style={{fontWeight:'bold', color:'#4338ca', marginBottom:3}}>📋 Doctor's Advice / Next Procedure:</Text>
                        <Text style={{color:'#374151'}}>{visit.planned_procedures}</Text>
                      </View>
                    ) : null}

                    {/* Summary Box */}
                    <View style={styles.historySummaryBox}>
                      {procTotal > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Procedure Total</Text><Text style={styles.summaryValue}>Rs. {procTotal.toFixed(0)}</Text></View>}
                      {medTotal > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Pharmacy Total</Text><Text style={styles.summaryValue}>Rs. {medTotal.toFixed(0)}</Text></View>}
                      <View style={[styles.summaryRow, {borderTopWidth:1, borderTopColor:'#ddd', paddingTop:8, marginTop:4}]}>
                        <Text style={[styles.summaryLabel, {fontWeight:'bold', fontSize:16}]}>GRAND TOTAL</Text>
                        <Text style={[styles.summaryValue, {fontWeight:'bold', fontSize:16, color:'#5C0B0B'}]}>Rs. {grandTotal.toFixed(0)}</Text>
                      </View>
                      {(visit.payments || []).map((p, i) => (
                        <View key={i} style={styles.summaryRow}>
                          <Text style={{color:'#10b981', fontSize:13}}>✓ Paid via {p.mode}</Text>
                          <Text style={{color:'#10b981', fontWeight:'bold'}}>Rs. {(parseFloat(p.amount_received)||0).toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Action Buttons */}
                    <View style={{flexDirection:'row', marginTop:12, gap:10}}>
                      <TouchableOpacity style={[styles.receiptBtn, {flex:1, marginTop:0}]} onPress={() => printReceipt(visit)}>
                        <Text style={styles.receiptBtnText}>🖨️ Generate Bill</Text>
                      </TouchableOpacity>
                      {(userRole === 'ADMIN' || userRole === 'DOCTOR') && (
                        <TouchableOpacity style={[styles.receiptBtn, {backgroundColor:'#ef4444', flex:0, paddingHorizontal:15, marginTop:0}]} onPress={() => deleteVisit(visit.visit_id)}>
                          <Text style={styles.receiptBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })"""

code = code.replace(OLD_HISTORY, NEW_HISTORY)

# ============================================================
# 3. Replace the printReceipt / PDF HTML with the new professional clinic bill
# ============================================================
OLD_PDF_START = "    const htmlContent = `\n      <html>\n        <head>\n          <style>\n            body { font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333; }\n            .header { text-align: center; border-bottom: 2px solid #5C0B0B; padding-bottom: 20px; margin-bottom: 30px; }\n            h1 { color: #5C0B0B; margin: 0; font-size: 32px; }\n            .sub { color: #666; font-size: 14px; margin-top: 5px; }\n            .details-box { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; }\n            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }\n            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }\n            th { background-color: #5C0B0B; color: white; }\n            .total-row { font-weight: bold; font-size: 18px; }\n            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #888; }\n          </style>\n        </head>\n        <body>\n          <div class=\"header\">\n            <h1>SKINSSENCE CLINIC</h1>\n            <div class=\"sub\">Dr. Ashima's Skin & Hair Clinic</div>\n          </div>"

OLD_PDF_END = "    try {\n      const { uri } = await Print.printToFileAsync({ html: htmlContent });\n      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });\n    } catch (error) {\n      console.error(error);\n      Alert.alert('Error', 'Failed to generate PDF.');\n    }\n  };"

# Find the entire block from OLD_PDF_START to OLD_PDF_END
import re
old_func_pattern = re.compile(
    re.escape(OLD_PDF_START) + r'.*?' + re.escape(OLD_PDF_END),
    re.DOTALL
)

NEW_PDF_FUNC = """    const procRows = (visit.procedures || []).map((p, i) => `
      <tr>
        <td style="padding:10px">${i+1}</td>
        <td style="padding:10px"><strong>${p.name}</strong>${p.area ? `<br><span style="color:#666;font-size:12px">Area: ${p.area}</span>` : ''}${p.notes ? `<br><span style="color:#888;font-size:12px;font-style:italic">${p.notes}</span>` : ''}</td>
        <td style="padding:10px;text-align:right">1</td>
        <td style="padding:10px;text-align:right">Rs. ${parseFloat(p.amount)||0}</td>
      </tr>`).join('');

    const medRows = (visit.medicines || []).map((m, i) => `
      <tr style="background:#fafafa">
        <td style="padding:10px">${(visit.procedures||[]).length + i + 1}</td>
        <td style="padding:10px">💊 ${m.details}</td>
        <td style="padding:10px;text-align:right">—</td>
        <td style="padding:10px;text-align:right">Rs. ${parseFloat(m.amount)||0}</td>
      </tr>`).join('');

    const procTotal = (visit.procedures || []).reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const medTotal = (visit.medicines || []).reduce((s,m) => s + (parseFloat(m.amount)||0), 0);
    const grandTotal = procTotal + medTotal;
    const payInfo = (visit.payments || []).map(p => `${p.mode}: Rs. ${parseFloat(p.amount_received)||0}`).join(' + ') || 'N/A';
    const invoiceNo = `INV-${visit.visit_id}-${new Date().getFullYear()}`;

    const htmlContent = `
      <html>
        <head>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Helvetica, Arial, sans-serif; padding: 30px; color: #222; background: #fff; }

            .header-container { display: flex; align-items: flex-start; border-bottom: 3px solid #5C0B0B; padding-bottom: 20px; margin-bottom: 20px; }
            .clinic-details { flex: 1; padding-left: 15px; }
            .clinic-details h1 { color: #5C0B0B; font-size: 22px; margin-bottom: 4px; letter-spacing: 0.5px; }
            .clinic-details .doc { font-size: 14px; color: #444; margin-bottom: 2px; }
            .clinic-details .addr { font-size: 13px; color: #666; }
            .bill-type { font-size: 18px; font-weight: bold; color: #5C0B0B; text-align: right; border: 2px solid #5C0B0B; padding: 5px 12px; border-radius: 5px; align-self: center; }

            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 25px; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
            .info-label { font-weight: bold; color: #555; font-size: 13px; }
            .info-value { color: #222; font-size: 13px; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background-color: #5C0B0B; color: white; padding: 12px; text-align: left; font-size: 13px; }
            th:last-child, td:last-child { text-align: right; }
            td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
            tr:nth-child(even) td { background: #fafafa; }

            .total-box { text-align: right; padding: 15px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; margin-bottom: 20px; }
            .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
            .total-row.grand { font-size: 18px; font-weight: bold; color: #5C0B0B; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 4px; }

            .advice-box { background: #eef2ff; border-left: 4px solid #4f46e5; padding: 12px 15px; border-radius: 5px; margin-bottom: 20px; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
            .go-green { color: #2e7d32; font-weight: bold; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div style="width:70px;height:70px;background:#5C0B0B;border-radius:35px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:white;font-size:28px;font-weight:bold;font-family:serif;">S</span>
            </div>
            <div class="clinic-details">
              <h1>SKINSSENCE LASER AND SKINCARE CLINIC</h1>
              <p class="doc">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</p>
              <p class="addr">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
              <p class="addr">📞 095091 97578 &nbsp;&nbsp;🌐 www.skinssence.in</p>
            </div>
            <div class="bill-type">RECEIPT</div>
          </div>

          <div class="info-grid">
            <div><span class="info-label">Patient Name: </span><span class="info-value">${patient.first_name} ${patient.last_name || ''}</span></div>
            <div><span class="info-label">Invoice No: </span><span class="info-value">${invoiceNo}</span></div>
            <div><span class="info-label">Patient ID: </span><span class="info-value">${patient.skinssence_id}</span></div>
            <div><span class="info-label">Date: </span><span class="info-value">${dateStr}</span></div>
            <div><span class="info-label">Mobile: </span><span class="info-value">${patient.mobile}</span></div>
            <div><span class="info-label">Doctor: </span><span class="info-value">Dr. ${visit.doctor_name}</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th>Description</th>
                <th style="width:60px;text-align:right">Qty</th>
                <th style="width:100px;text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${procRows}
              ${medRows}
            </tbody>
          </table>

          <div class="total-box">
            ${procTotal > 0 ? `<div class="total-row"><span>Procedure Total</span><span>Rs. ${procTotal.toFixed(2)}</span></div>` : ''}
            ${medTotal > 0 ? `<div class="total-row"><span>Pharmacy/Medicine Total</span><span>Rs. ${medTotal.toFixed(2)}</span></div>` : ''}
            <div class="total-row grand"><span>GRAND TOTAL</span><span>Rs. ${grandTotal.toFixed(2)}</span></div>
            <div class="total-row" style="color:#10b981"><span>Payment</span><span>${payInfo}</span></div>
          </div>

          ${visit.planned_procedures && visit.planned_procedures !== 'PHARMACY SALE' ? `
            <div class="advice-box">
              <strong>📋 Doctor's Advice / Next Procedure:</strong><br>
              <span style="color:#374151">${visit.planned_procedures}</span>
            </div>` : ''}

          <div class="footer">
            <p>Thank you for choosing Skinssence Laser and Skincare Clinic!</p>
            <p>This is a computer generated receipt and does not require a signature.</p>
            <p class="go-green">🌿 Go Green — Thank you for choosing a digital receipt!</p>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate PDF.');
    }
  };"""

code = old_func_pattern.sub(NEW_PDF_FUNC, code)

# ============================================================
# 4. Add new history styles
# ============================================================
code = code.replace(
    "  historyEmpty: { padding: 30, alignItems: 'center' },\n  historyEmptyText: { color: '#9ca3af', fontSize: 16 },",
    """  historyEmpty: { padding: 30, alignItems: 'center' },
  historyEmptyText: { color: '#9ca3af', fontSize: 16 },
  historyHeaderTouchable: { padding: 5 },
  historyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyGrandTotal: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B' },
  historyPaid: { fontSize: 12, color: '#10b981', marginTop: 2 },
  historyExpanded: { paddingTop: 4 },
  historySection: { fontSize: 13, fontWeight: 'bold', color: '#4f46e5', marginTop: 10, marginBottom: 6 },
  historyLineItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  historyLineName: { fontSize: 14, color: '#1f2937' },
  historyLineNote: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 },
  historyLineAmt: { fontSize: 14, fontWeight: 'bold', color: '#1f2937', minWidth: 70, textAlign: 'right' },
  historyAdviceBox: { backgroundColor: '#eef2ff', borderLeftWidth: 4, borderLeftColor: '#4338ca', padding: 12, borderRadius: 5, marginTop: 12 },
  historySummaryBox: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: '#eee' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 14, color: '#374151' },
  summaryValue: { fontSize: 14, color: '#374151' },"""
)

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Done!")
