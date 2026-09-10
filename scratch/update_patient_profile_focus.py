with open('mobile/screens/PatientProfileScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update imports to include useCallback and useFocusEffect and RefreshControl
old_import = "import React, { useState, useEffect } from 'react';"
new_import = "import React, { useState, useEffect, useCallback } from 'react';\nimport { useFocusEffect } from '@react-navigation/native';"

if old_import in code:
    code = code.replace(old_import, new_import)

old_rn_import = "import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Linking, Modal } from 'react-native';"
new_rn_import = "import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Linking, Modal, RefreshControl } from 'react-native';"

if old_rn_import in code:
    code = code.replace(old_rn_import, new_rn_import)

# 2. Add refreshing state and useFocusEffect
old_use_effect = """  useEffect(() => {
    fetchHistory();
    fetchPackages();
    AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
  }, []);"""

new_use_effect = """  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
      fetchPackages();
      AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
    }, [patient.id])
  );

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchHistory(), fetchPackages()]).finally(() => setRefreshing(false));
  };"""

if old_use_effect in code:
    code = code.replace(old_use_effect, new_use_effect)
    print("Replaced useEffect with useFocusEffect in PatientProfileScreen!")
else:
    print("Warning: old_use_effect pattern not matched")

# 3. Add refreshControl to ScrollView
old_scroll = "<ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 50 }}>"
new_scroll = "<ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 50 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>"

if old_scroll in code:
    code = code.replace(old_scroll, new_scroll)
    print("Added RefreshControl to ScrollView in PatientProfileScreen!")

with open('mobile/screens/PatientProfileScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("PatientProfileScreen updated successfully!")
