# 1. Update DoctorDashboard.js
with open('mobile/screens/DoctorDashboard.js', 'r', encoding='utf-8') as f:
    dd = f.read()

# Add todayStats to DoctorDashboard
old_states = """  const [userName, setUserName] = useState('');
  const [expiringItems, setExpiringItems] = useState([]);"""

new_states = """  const [userName, setUserName] = useState('');
  const [expiringItems, setExpiringItems] = useState([]);
  const [todayStats, setTodayStats] = useState({ patients: 0, collection: 0 });"""

dd = dd.replace(old_states, new_states)

# Fetch todayStats in DoctorDashboard
old_load = """      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await axios.get('https://skinssence-api.onrender.com/api/inventory/analytics', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.expiringSoon) {
          setExpiringItems(res.data.expiringSoon);
        }
      } catch (e) {}"""

new_load = """      try {
        const token = await AsyncStorage.getItem('userToken');
        const [analyticsRes, todayRes] = await Promise.all([
          axios.get('https://skinssence-api.onrender.com/api/inventory/analytics', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('https://skinssence-api.onrender.com/api/dashboard/today', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (analyticsRes.data && analyticsRes.data.expiringSoon) {
          setExpiringItems(analyticsRes.data.expiringSoon);
        }
        if (todayRes.data) {
          setTodayStats({
            patients: todayRes.data.patients || 0,
            collection: todayRes.data.collection || 0
          });
        }
      } catch (e) {}"""

dd = dd.replace(old_load, new_load)

# Update Alarm Banner in DoctorDashboard
old_alarm = """        {expiringItems.length > 0 && (
          <View style={{backgroundColor: '#fee2e2', padding: 15, margin: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ef4444'}}>
            <Text style={{color: '#b91c1c', fontWeight: 'bold', fontSize: 16, marginBottom: 5}}>⚠️ INVENTORY EXPIRY ALARM</Text>
            <Text style={{color: '#991b1b', marginBottom: 5}}>You have {expiringItems.length} item(s) expiring within 30 days:</Text>
            {expiringItems.map((item, idx) => (
              <Text key={idx} style={{color: '#7f1d1d'}}>• {item.name} (Qty: {item.qty}) - {item.expiry}</Text>
            ))}
          </View>
        )}"""

new_alarm = """        {expiringItems.length > 0 && (
          <TouchableOpacity 
            style={{ backgroundColor: '#fee2e2', padding: 14, margin: 15, borderRadius: 10, borderWidth: 1.5, borderColor: '#ef4444' }}
            onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#991b1b', fontWeight: 'bold', fontSize: 15 }}>⚠️ MEDICINE EXPIRY ALARM</Text>
              <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{expiringItems.length} Urgent Items ›</Text>
            </View>
            <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 6 }}>
              {expiringItems.length} medicine(s) are already expired or expiring within 3 months.
            </Text>
            {expiringItems.slice(0, 3).map((item, idx) => (
              <Text key={idx} style={{ color: '#991b1b', fontSize: 12, marginTop: 2 }}>
                • {item.name} {item.batch ? `(${item.batch})` : ''} — {item.statusLabel || 'Urgent'} ({item.daysRemaining !== null ? (item.daysRemaining < 0 ? `Expired ${Math.abs(item.daysRemaining)}d ago` : `${item.daysRemaining}d left`) : (item.formattedExpiry || item.expiry)})
              </Text>
            ))}
            <Text style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: 12, marginTop: 8, textAlign: 'right' }}>
              🔍 Tap to open Expiry Dashboard →
            </Text>
          </TouchableOpacity>
        )}"""

dd = dd.replace(old_alarm, new_alarm)

# Replace static 0 in dashboard cards
old_cards = """        <View style={styles.dashboardCards}>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>Today's Patients</Text>
            <Text style={styles.cardValue}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>Today's Collection</Text>
            <Text style={styles.cardValue}>₹ 0</Text>
          </TouchableOpacity>"""

new_cards = """        <View style={styles.dashboardCards}>
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AllPatients')}>
            <Text style={styles.cardTitle}>Today's Patients</Text>
            <Text style={styles.cardValue}>{todayStats.patients}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DoctorReports')}>
            <Text style={styles.cardTitle}>Today's Collection</Text>
            <Text style={styles.cardValue}>₹ {parseFloat(todayStats.collection).toFixed(2)}</Text>
          </TouchableOpacity>"""

dd = dd.replace(old_cards, new_cards)

# Rename Pharmacy Analytics menu label in DoctorDashboard
dd = dd.replace("<Text style={styles.listText}>Pharmacy Analytics (Dead Stock)</Text>",
                "<Text style={styles.listText}>📅 Medicine Expiry & Pharmacy Analytics</Text>")

with open('mobile/screens/DoctorDashboard.js', 'w', encoding='utf-8') as f:
    f.write(dd)
print("DoctorDashboard.js updated successfully!")

# 2. Update StaffDashboard.js
with open('mobile/screens/StaffDashboard.js', 'r', encoding='utf-8') as f:
    sd = f.read()

# Add alarm banner to StaffDashboard right below header
old_sd_scroll = """      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>"""

new_sd_scroll = """      <ScrollView contentContainerStyle={styles.scrollContent}>
        {expiringItems.length > 0 && (
          <TouchableOpacity 
            style={{ backgroundColor: '#fee2e2', padding: 14, marginHorizontal: 20, marginTop: 15, borderRadius: 10, borderWidth: 1.5, borderColor: '#ef4444' }}
            onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#991b1b', fontWeight: 'bold', fontSize: 15 }}>⚠️ MEDICINE EXPIRY ALARM</Text>
              <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{expiringItems.length} Urgent ›</Text>
            </View>
            <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 4 }}>
              {expiringItems.length} medicine(s) expiring soon or expired. Tap to view full list.
            </Text>
            {expiringItems.slice(0, 2).map((item, idx) => (
              <Text key={idx} style={{ color: '#991b1b', fontSize: 12, marginTop: 2 }}>
                • {item.name} — {item.daysRemaining !== null ? (item.daysRemaining < 0 ? `Expired ${Math.abs(item.daysRemaining)}d ago` : `${item.daysRemaining}d left`) : (item.formattedExpiry || item.expiry)}
              </Text>
            ))}
          </TouchableOpacity>
        )}
        <View style={styles.grid}>"""

sd = sd.replace(old_sd_scroll, new_sd_scroll)

# Rename Pharmacy Stock to Medicine Expiry & Stock in StaffDashboard
sd = sd.replace("<Text style={styles.cardText}>Pharmacy Stock</Text>",
                "<Text style={styles.cardText}>📅 Medicine Expiry</Text>")

with open('mobile/screens/StaffDashboard.js', 'w', encoding='utf-8') as f:
    f.write(sd)
print("StaffDashboard.js updated successfully!")
