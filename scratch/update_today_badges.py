with open('mobile/screens/TodayPatientsScreen.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_badge_func = """  const getVisitStatusBadge = (cFee, procsCount, medsCount, isPharmacyOnly) => {
    if (isPharmacyOnly) return { label: '💊 Pharmacy Only', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
    if (cFee > 0 && procsCount === 0 && medsCount === 0) return { label: '🩺 Consultation Only', bg: '#f0fdf4', text: '#166534', border: '#86efac' };
    if (cFee > 0 && procsCount > 0 && medsCount === 0) return { label: '🩺+🏥 Consultation & Procedure', bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
    if (cFee === 0 && procsCount > 0 && medsCount === 0) return { label: '🏥 Procedure Only', bg: '#faf5ff', text: '#6b21a8', border: '#d8b4fe' };
    if (cFee > 0 && procsCount === 0 && medsCount > 0) return { label: '🩺+💊 Consultation & Pharmacy', bg: '#ecfeff', text: '#155e75', border: '#a5f3fc' };
    if (cFee > 0 && procsCount > 0 && medsCount > 0) return { label: '🌟 Full Service (All 3)', bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' };
    if (cFee === 0 && procsCount > 0 && medsCount > 0) return { label: '🏥+💊 Procedure & Pharmacy', bg: '#fff7ed', text: '#9a3412', border: '#ffedd5' };
    return { label: '📋 General Visit', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  };"""

new_badge_func = """  const getVisitStatusBadge = (cFee, procsCount, medsCount, isPharmacyOnly, plannedProcs) => {
    if (cFee === 0 && procsCount === 0 && medsCount === 0) {
      if ((plannedProcs || '').includes('REPORT')) return { label: '🔬 Report Review (₹0)', bg: '#f0fdf4', text: '#166534', border: '#86efac' };
      return { label: '📋 Follow-up / Check (₹0)', bg: '#f8fafc', text: '#475569', border: '#cbd5e1' };
    }
    if (isPharmacyOnly && cFee === 0 && procsCount === 0) return { label: '💊 Pharmacy Only', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
    if (cFee > 0 && procsCount === 0 && medsCount === 0) return { label: '🩺 Consultation Only', bg: '#f0fdf4', text: '#166534', border: '#86efac' };
    if (cFee > 0 && procsCount > 0 && medsCount === 0) return { label: '🩺+🏥 Consultation & Procedure', bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
    if (cFee === 0 && procsCount > 0 && medsCount === 0) return { label: '🏥 Procedure Only', bg: '#faf5ff', text: '#6b21a8', border: '#d8b4fe' };
    if (cFee > 0 && procsCount === 0 && medsCount > 0) return { label: '🩺+💊 Consultation & Pharmacy', bg: '#ecfeff', text: '#155e75', border: '#a5f3fc' };
    if (cFee > 0 && procsCount > 0 && medsCount > 0) return { label: '🌟 Full Service (All 3)', bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' };
    if (cFee === 0 && procsCount > 0 && medsCount > 0) return { label: '🏥+💊 Procedure & Pharmacy', bg: '#fff7ed', text: '#9a3412', border: '#ffedd5' };
    return { label: '📋 General Visit', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  };"""

old_call = "const statusBadge = getVisitStatusBadge(cFee, procs.length, meds.length, isPharmacyOnly);"
new_call = "const statusBadge = getVisitStatusBadge(cFee, procs.length, meds.length, isPharmacyOnly, item.planned_procedures);"

if old_badge_func in code:
    code = code.replace(old_badge_func, new_badge_func)
    print("Updated getVisitStatusBadge!")

if old_call in code:
    code = code.replace(old_call, new_call)
    print("Updated statusBadge call!")

with open('mobile/screens/TodayPatientsScreen.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("TodayPatientsScreen.js saved!")
