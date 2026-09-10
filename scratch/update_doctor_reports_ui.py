with open('mobile/screens/DoctorReportsScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update Today's Sales Card in DoctorReportsScreen.js
old_today_grid = """                <View style={styles.breakdownGrid}>
                  <View style={[styles.breakdownBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#1e40af' }]}>🏥 Procedures / Services</Text>
                    <Text style={[styles.breakdownValue, { color: '#1e3a8a' }]}>₹ {reportData.today.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.procedureSessions} sessions recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#15803d' }]}>💊 Medicine Sales</Text>
                    <Text style={[styles.breakdownValue, { color: '#14532d' }]}>₹ {reportData.today.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.medicineTransactions} bills ({reportData.today.medicineUnitsSold} units)</Text>
                  </View>
                </View>"""

new_today_grid = """                <View style={styles.breakdownGrid}>
                  <View style={[styles.breakdownBox, { backgroundColor: '#fef3c7', borderColor: '#fde68a', marginBottom: 8, width: '100%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#92400e' }]}>🩺 Consultation Fees</Text>
                    <Text style={[styles.breakdownValue, { color: '#78350f' }]}>₹ {(reportData.today.consultationRevenue || 0).toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.consultationCount || 0} consultations recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#1e40af' }]}>🏥 Procedures / Services</Text>
                    <Text style={[styles.breakdownValue, { color: '#1e3a8a' }]}>₹ {reportData.today.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.procedureSessions} sessions recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#15803d' }]}>💊 Medicine Sales</Text>
                    <Text style={[styles.breakdownValue, { color: '#14532d' }]}>₹ {reportData.today.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.medicineTransactions} bills ({reportData.today.medicineUnitsSold} units)</Text>
                  </View>
                </View>"""

if old_today_grid in code:
    code = code.replace(old_today_grid, new_today_grid)
    print("Updated Today's Breakdown Grid in DoctorReportsScreen.js!")
else:
    print("Warning: old_today_grid not matched!")

with open('mobile/screens/DoctorReportsScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("DoctorReportsScreen.js saved!")
