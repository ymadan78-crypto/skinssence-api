import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Switch } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function UserManagementScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New User Form State
  const [formData, setFormData] = useState({ name: '', username: '', password: '', role: 'STAFF' });
  
  // Reset Password State
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const API_URL = 'https://skinssence-api.onrender.com/api/users';

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fetchUsers = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, { headers: { Authorization: `Bearer ${token}` } });
      setUsers(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.name || !formData.username || !formData.password) {
      Alert.alert('Error', 'Name, username, and password are required.');
      return;
    }
    
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(API_URL, formData, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('Success', 'User created successfully!');
      setFormData({ name: '', username: '', password: '', role: 'STAFF' });
      fetchUsers();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Could not create user.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (id) => {
    if (!newPassword) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/${id}/password`, { newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('Success', 'Password updated successfully!');
      setResetId(null);
      setNewPassword('');
    } catch (error) {
      Alert.alert('Error', 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (id, username) => {
    if (id === 1 || username === 'admin') {
      Alert.alert('Error', 'Cannot delete main admin account');
      return;
    }
    Alert.alert('Confirm Delete', `Delete user @${username}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const token = await AsyncStorage.getItem('userToken');
          await axios.delete(`${API_URL}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          Alert.alert('Success', 'User deleted');
          fetchUsers();
        } catch (error) {
          Alert.alert('Error', error.response?.data?.error || 'Failed to delete');
        }
      }}
    ]);
  };

  const togglePermission = async (user, permissionKey) => {
    try {
      let perms = {};
      if (user.permissions) {
        try {
          perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
        } catch(e){}
      }
      perms[permissionKey] = !perms[permissionKey];

      const token = await AsyncStorage.getItem('userToken');
      try {
        await axios.put(`https://skinssence-api.onrender.com/api/users/${user.id}/permissions`, { permissions: perms }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (cloudErr) {
        await axios.put(`http://localhost:3000/api/users/${user.id}/permissions`, { permissions: perms }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      fetchUsers();
    } catch (e) {
      Alert.alert('Error', 'Failed to update permissions');
    }
  };

  const getPerm = (user, key) => {
    if (!user.permissions) return false;
    try {
       const p = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
       return !!p[key];
    } catch(e) { return false; }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>⬅ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User & Role Management</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Create New User Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create New Account</Text>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} placeholder="e.g. Divya Sharma" value={formData.name} onChangeText={(v) => handleInputChange('name', v)} />
          
          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} placeholder="e.g. divya_staff" value={formData.username} onChangeText={(v) => handleInputChange('username', v)} autoCapitalize="none" />
          
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} placeholder="Initial password" secureTextEntry value={formData.password} onChangeText={(v) => handleInputChange('password', v)} />

          <Text style={styles.label}>Role</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity style={[styles.roleBtn, formData.role === 'STAFF' && styles.roleSelected]} onPress={() => handleInputChange('role', 'STAFF')}>
              <Text style={formData.role === 'STAFF' ? {color:'#fff', fontWeight:'bold'} : {color:'#555'}}>STAFF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleBtn, formData.role === 'DOCTOR' && styles.roleSelected]} onPress={() => handleInputChange('role', 'DOCTOR')}>
              <Text style={formData.role === 'DOCTOR' ? {color:'#fff', fontWeight:'bold'} : {color:'#555'}}>ADMIN (DOCTOR)</Text>
            </TouchableOpacity>
          </View>
          
          {formData.role === 'STAFF' && (
            <>
              <Text style={styles.label}>Monthly Fixed Salary (₹)</Text>
              <TextInput style={styles.input} placeholder="e.g. 10000" keyboardType="numeric" value={formData.monthly_salary} onChangeText={(v) => handleInputChange('monthly_salary', v)} />
            </>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleCreateUser} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Account</Text>}
          </TouchableOpacity>
        </View>

        {/* Existing Users List */}
        <Text style={styles.sectionTitle}>Current Accounts & Permissions</Text>
        {loading && users.length === 0 ? (
          <ActivityIndicator size="large" color="#5C0B0B" />
        ) : (
          users.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userHeader}>
                <View>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userUsername}>@{user.username} {user.role === 'STAFF' ? `| Salary: ₹${user.monthly_salary || 0}` : ''}</Text>
                </View>
                <Text style={user.role === 'DOCTOR' ? styles.badgeAdmin : styles.badgeStaff}>{user.role}</Text>
              </View>

              {/* Toggles */}
              {user.role === 'STAFF' && (
                <View style={styles.permissionsBox}>
                  <Text style={styles.permHeader}>Staff Permissions (Toggles)</Text>
                  {[
                    { key: 'can_see_daily_diary', label: '📖 Can See Daily Diary', isPrimary: true },
                    { key: 'can_delete', label: 'Can Delete Visits/Bills' },
                    { key: 'can_view_reports', label: 'Can View Financial Reports' },
                    { key: 'can_add_stock', label: 'Can Add Pharmacy Stock' },
                    { key: 'can_manage_hr', label: 'Can Manage HR/Salaries' }
                  ].map(p => (
                    <View key={p.key} style={[styles.toggleRow, p.isPrimary && styles.primaryToggleRow]}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.toggleLabel, p.isPrimary && styles.primaryToggleLabel]}>{p.label}</Text>
                        {p.isPrimary && (
                          <Text style={styles.primaryToggleSub}>
                            {getPerm(user, p.key) ? '🟢 Toggle ON (Visible on Staff Dashboard)' : '⚪ Toggle OFF (Hidden from Staff Dashboard)'}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={getPerm(user, p.key)}
                        onValueChange={() => togglePermission(user, p.key)}
                        trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                        thumbColor={getPerm(user, p.key) ? '#16a34a' : '#f4f3f4'}
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Password Reset Logic */}
              {resetId === user.id ? (
                <View style={styles.resetBox}>
                  <TextInput style={styles.input} placeholder="Enter new password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => { setResetId(null); setNewPassword(''); }}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveBtn} onPress={() => handleResetPassword(user.id)}>
                      <Text style={styles.saveBtnText}>Save Password</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionBtnReset} onPress={() => setResetId(user.id)}>
                    <Text style={styles.actionBtnText}>Reset Password</Text>
                  </TouchableOpacity>
                  
                  {user.id !== 1 && user.username !== 'admin' && (
                    <TouchableOpacity style={styles.actionBtnDelete} onPress={() => handleDeleteUser(user.id, user.username)}>
                      <Text style={styles.actionBtnText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { marginRight: 15 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 15 },
  
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 16 },
  
  roleContainer: { flexDirection: 'row', marginTop: 5 },
  roleBtn: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', marginHorizontal: 5, borderRadius: 8 },
  roleSelected: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  roleText: { fontWeight: 'bold', color: '#4b5563' },
  roleTextSelected: { color: '#fff', fontWeight: 'bold' },
  
  submitBtn: { backgroundColor: '#5C0B0B', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  userCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 1, marginBottom: 15, borderWidth: 1, borderColor: '#e1e5eb' },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  userName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  userUsername: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  
  badgeAdmin: { backgroundColor: '#fee2e2', color: '#b91c1c', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
  badgeStaff: { backgroundColor: '#dbeafe', color: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },

  permissionsBox: { marginTop: 10, marginBottom: 15, backgroundColor: '#f9fafb', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  permHeader: { fontSize: 14, fontWeight: 'bold', color: '#4b5563', marginBottom: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  toggleLabel: { fontSize: 14, color: '#374151' },
  primaryToggleRow: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 4,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  primaryToggleLabel: {
    fontWeight: 'bold',
    color: '#166534',
    fontSize: 14,
  },
  primaryToggleSub: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 2,
  },

  actionRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  actionBtnReset: { backgroundColor: '#f3f4f6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6, marginRight: 10 },
  actionBtnDelete: { backgroundColor: '#fee2e2', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
  actionBtnText: { fontWeight: 'bold', color: '#374151', fontSize: 14 },

  resetBox: { backgroundColor: '#f9fafc', padding: 15, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtn: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#e5e7eb', borderRadius: 6, marginRight: 5, marginTop: 10 },
  cancelBtnText: { fontWeight: 'bold', color: '#374151' },
  saveBtn: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#10b981', borderRadius: 6, marginLeft: 5, marginTop: 10 },
  saveBtnText: { fontWeight: 'bold', color: '#fff' }
});
