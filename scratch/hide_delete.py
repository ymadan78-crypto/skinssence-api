import re

with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Add userRole state
if "const [userRole, setUserRole] = useState" not in code:
    code = code.replace(
        "const [rechargeModalVisible, setRechargeModalVisible] = useState(false);",
        "const [rechargeModalVisible, setRechargeModalVisible] = useState(false);\n  const [userRole, setUserRole] = useState('');\n  useEffect(() => { AsyncStorage.getItem('userRole').then(role => setUserRole(role ? role.toUpperCase() : '')); }, []);"
    )

# Hide delete button
delete_btn_old = """                  <TouchableOpacity 
                    style={[styles.receiptBtn, { backgroundColor: '#ef4444', flex: 0, paddingHorizontal: 15, marginTop: 0 }]} 
                    onPress={() => deleteVisit(visit.visit_id)}>
                    <Text style={styles.receiptBtnText}>🗑️</Text>
                  </TouchableOpacity>"""

delete_btn_new = """                  {(userRole === 'ADMIN' || userRole === 'DOCTOR') && (
                    <TouchableOpacity 
                      style={[styles.receiptBtn, { backgroundColor: '#ef4444', flex: 0, paddingHorizontal: 15, marginTop: 0 }]} 
                      onPress={() => deleteVisit(visit.visit_id)}>
                      <Text style={styles.receiptBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  )}"""

code = code.replace(delete_btn_old, delete_btn_new)

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)
