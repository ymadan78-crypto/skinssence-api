import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ExpenseEntryScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  
  const [formData, setFormData] = useState({
    category: 'Pharmacy',
    vendor: '',
    amount: '',
    expense_date: '',
    notes: ''
  });

  const [inventoryItems, setInventoryItems] = useState([
    { medicine_name: '', batch_number: '', mrp: '', quantity: '', expiry_date: '' }
  ]);

  const addInventoryItem = () => {
    setInventoryItems([...inventoryItems, { medicine_name: '', batch_number: '', mrp: '', quantity: '', expiry_date: '' }]);
  };

  const updateInventoryItem = (index, field, value) => {
    const updated = [...inventoryItems];
    updated[index][field] = value;
    setInventoryItems(updated);
  };

  const removeInventoryItem = (index) => {
    const updated = [...inventoryItems];
    updated.splice(index, 1);
    setInventoryItems(updated);
  };

  const API_URL = 'https://skinssence-api.onrender.com/api/expenses';

  const categories = [
    'MEDICINES', 
    'UTILITY BILLS', 
    'REPAIR & MAINTENANCE', 
    'CONSUMABLES', 
    'EQUIPMENT', 
    'SALARIES', 
    'STATIONERY', 
    'ADVERTISEMENT', 
    'DONATION', 
    'CAPITAL INVESTMENT', 
    'GENERAL ARTICLES', 
    'MISCELLANEOUS',
    'OTHER'
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAutoFill = () => {
    if (!ocrText) return;
    
    // Simple basic regex parser to demonstrate the OCR autofill concept for V1.
    // Looks for common currency patterns: Rs, Rs., ₹, or Amount followed by numbers.
    let extractedAmount = '';
    const amountMatch = ocrText.match(/(?:Rs\.?|₹|Amount:?|Total:?)\s*(\d+(?:\.\d+)?)/i);
    if (amountMatch && amountMatch[1]) {
      extractedAmount = amountMatch[1];
    } else {
      // Fallback: just find the largest standalone number
      const numbers = ocrText.match(/\b\d+(?:\.\d{1,2})?\b/g);
      if (numbers) {
        extractedAmount = numbers.sort((a, b) => parseFloat(b) - parseFloat(a))[0];
      }
    }

    // Try to guess the vendor (often the first line of the receipt)
    let extractedVendor = '';
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      extractedVendor = lines[0]; // Assume top line is store name
    }

    setFormData(prev => ({
      ...prev,
      amount: extractedAmount,
      vendor: extractedVendor,
      notes: 'Auto-filled from OCR text'
    }));

    Alert.alert('Auto-Fill Complete', 'Extracted amount and vendor from the pasted text! Please verify the details below.');
  };

  const [updateInventory, setUpdateInventory] = useState(false);

  const handleSubmit = async () => {
    if (!formData.amount) {
      Alert.alert('Incomplete', 'Expense Amount is mandatory.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(API_URL, {
        category: formData.category,
        vendor: formData.vendor,
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        notes: formData.notes,
        raw_ocr_text: ocrText,
        update_inventory: updateInventory,
        inventory_items: formData.category === 'Pharmacy' ? inventoryItems : []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      Alert.alert('Success', 'Expense recorded successfully!');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to record expense.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Expense</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* OCR Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Smart Receipt Scan</Text>
          <Text style={styles.label}>Paste text copied from Google Lens/OCR</Text>
          <TextInput 
            style={[styles.input, { height: 100, backgroundColor: '#f0fdf4' }]} 
            multiline 
            placeholder="Paste raw bill text here..."
            value={ocrText} 
            onChangeText={setOcrText} 
          />
          <TouchableOpacity style={styles.autoFillBtn} onPress={handleAutoFill}>
            <Text style={styles.autoFillBtnText}>✨ Extract Details Automatically</Text>
          </TouchableOpacity>
        </View>

        {/* Manual/Verified Entry */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense Details</Text>
          
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map(cat => (
              <TouchableOpacity 
                key={cat} 
                style={[styles.categoryBtn, formData.category === cat && styles.categorySelected]} 
                onPress={() => handleInputChange('category', cat)}
              >
                <Text style={[styles.categoryText, formData.category === cat && styles.categoryTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <Text style={styles.label}>Vendor / Biller Name</Text>
          <TextInput style={styles.input} value={formData.vendor} onChangeText={(v) => handleInputChange('vendor', v)} placeholder="e.g. Apollo Pharmacy" />
          
          <Text style={styles.label}>Total Amount (₹) *</Text>
          <TextInput style={[styles.input, styles.highlightInput]} keyboardType="numeric" value={formData.amount} onChangeText={(v) => handleInputChange('amount', v)} />
          
          <Text style={styles.label}>Bill Date (Optional)</Text>
          <TextInput style={styles.input} value={formData.expense_date} placeholder="mm/dd/yyyy" onChangeText={(v) => handleInputChange('expense_date', v)} />

          <Text style={styles.label}>Additional Notes</Text>
          <TextInput style={styles.input} value={formData.notes} onChangeText={(v) => handleInputChange('notes', v)} />
        </View>

        {formData.category === 'Pharmacy' && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 }}>
              <Text style={{ fontWeight: 'bold', color: '#b91c1c', flex: 1 }}>Update Current Stock with these items? (Turn OFF for old historic bills!)</Text>
              <Switch value={updateInventory} onValueChange={setUpdateInventory} />
            </View>

            <Text style={styles.sectionTitle}>Add Medicines</Text>
            
            {inventoryItems.map((item, index) => (
              <View key={index} style={{ marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                <Text style={styles.label}>Medicine #{index + 1}</Text>
                <TextInput style={styles.input} placeholder="Medicine Name" value={item.medicine_name} onChangeText={(v) => updateInventoryItem(index, 'medicine_name', v)} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TextInput style={[styles.input, { width: '48%' }]} placeholder="Batch No" value={item.batch_number} onChangeText={(v) => updateInventoryItem(index, 'batch_number', v)} />
                  <TextInput style={[styles.input, { width: '48%' }]} placeholder="Expiry (mm/yy)" value={item.expiry_date} onChangeText={(v) => updateInventoryItem(index, 'expiry_date', v)} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TextInput style={[styles.input, { width: '48%' }]} placeholder="Qty (Pills/Tubes)" keyboardType="numeric" value={item.quantity} onChangeText={(v) => updateInventoryItem(index, 'quantity', v)} />
                  <TextInput style={[styles.input, { width: '48%' }]} placeholder="MRP (₹)" keyboardType="numeric" value={item.mrp} onChangeText={(v) => updateInventoryItem(index, 'mrp', v)} />
                </View>
                <TouchableOpacity onPress={() => removeInventoryItem(index)}>
                  <Text style={{ color: '#ef4444', textAlign: 'right', fontWeight: 'bold' }}>Remove Item</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={{ backgroundColor: '#eef2ff', padding: 10, borderRadius: 5, alignItems: 'center' }} onPress={addInventoryItem}>
              <Text style={{ color: '#4f46e5', fontWeight: 'bold' }}>+ Add Another Medicine Item</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save Expense & Inventory</Text>}
        </TouchableOpacity>
        
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
  section: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 5 },
  input: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 15 },
  highlightInput: { borderColor: '#10b981', backgroundColor: '#f0fdf4', fontSize: 18, fontWeight: 'bold' },
  autoFillBtn: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center' },
  autoFillBtnText: { color: '#fff', fontWeight: 'bold' },
  categoryScroll: { flexDirection: 'row', marginBottom: 15 },
  categoryBtn: { paddingHorizontal: 15, paddingVertical: 8, borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 20, marginRight: 10, backgroundColor: '#f9fafc' },
  categorySelected: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  categoryText: { color: '#4b5563', fontWeight: 'bold' },
  categoryTextSelected: { color: '#fff' },
  submitBtn: { backgroundColor: '#5C0B0B', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
