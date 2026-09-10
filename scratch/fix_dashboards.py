with open('mobile/screens/StaffDashboard.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix label: "Create Bill" → "Pharmacy / Create Bill"
code = code.replace(
    '<Text style={styles.cardText}>Create Bill</Text>',
    '<Text style={styles.cardText}>💊 Pharmacy / Create Bill</Text>'
)

with open('mobile/screens/StaffDashboard.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("StaffDashboard fixed!")

with open('mobile/screens/DoctorDashboard.js', 'r', encoding='utf-8') as f:
    code2 = f.read()

# Fix label: "Pharmacy Billing (PDF)" → "💊 Pharmacy / Create Bill"
code2 = code2.replace(
    '<Text style={styles.listText}>Pharmacy Billing (PDF)</Text>',
    '<Text style={styles.listText}>💊 Pharmacy / Create Bill</Text>'
)

with open('mobile/screens/DoctorDashboard.js', 'w', encoding='utf-8') as f:
    f.write(code2)
print("DoctorDashboard fixed!")
