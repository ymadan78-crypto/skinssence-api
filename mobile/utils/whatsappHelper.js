export const generateFollowUpMessage = (appt) => {
  const name = appt.patient_name ? appt.patient_name.trim() : 'Client';
  
  let dateStr = '';
  if (appt.appointment_date) {
    try {
      const parts = appt.appointment_date.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      } else {
        dateStr = new Date(appt.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    } catch (e) {
      dateStr = appt.appointment_date;
    }
  }

  const timeStr = appt.appointment_time ? appt.appointment_time.trim() : '';
  const purpose = appt.notes ? appt.notes.trim() : (appt.purpose ? appt.purpose.trim() : '');
  const status = (appt.status || '').toUpperCase();

  // 1. Confirmed Appointment
  if (status === 'CONFIRMED' && dateStr && timeStr) {
    return `Hello ${name}, this is a reminder from Skinssence Laser & Skincare Clinic.\n\nYour appointment with Dr. Ashima is scheduled for ${dateStr} at ${timeStr}${purpose ? ` for ${purpose}` : ''}.\n\nPlease let us know if you need to reschedule, or reply to confirm.\n\nSkinssence Laser & Skincare Clinic\nTalwandi, Kota\n📞 +91 95091 97578`;
  }

  // 2. Next Session of Ongoing Procedure / Package
  const purposeLower = purpose.toLowerCase();
  const isNextSession = purposeLower.includes('session') || purposeLower.includes('sitting') || purposeLower.includes('package') || purposeLower.includes('lhr') || purposeLower.includes('hydrafacial') || purposeLower.includes('peel') || purposeLower.includes('prp') || purposeLower.includes('laser');
  if (isNextSession) {
    return `Hello ${name}, this is a reminder from Skinssence Laser & Skincare Clinic.\n\nAs advised by Dr. Ashima, your next session for ${purpose || 'your ongoing treatment'} is due around ${dateStr || 'this week'}.\n\nPlease let us know your preferred date and time, or call the clinic to confirm your slot.\n\nSkinssence Laser & Skincare Clinic\nTalwandi, Kota\n📞 +91 95091 97578`;
  }

  // 3. Post-Procedure Review
  const isReview = purposeLower.includes('review') || purposeLower.includes('post') || purposeLower.includes('check');
  if (isReview) {
    return `Hello ${name}, this is a reminder from Skinssence Laser & Skincare Clinic.\n\nAs advised by Dr. Ashima during your consultation, your ${purpose} is due on ${dateStr || 'this week'}.\n\nPlease let us know your preferred date and time for the review.\n\nSkinssence Laser & Skincare Clinic\nTalwandi, Kota\n📞 +91 95091 97578`;
  }

  // 4. Follow-up Consultation / Treatment Follow-up
  const treatmentText = purpose ? `${purpose} follow-up` : 'follow-up consultation';
  return `Hello ${name}, this is a reminder from Skinssence Laser & Skincare Clinic.\n\nAs advised by Dr. Ashima during your consultation, your ${treatmentText} is due on ${dateStr || 'this week'}.\n\nPlease let us know your preferred date and time, or call the clinic to confirm your appointment.\n\nSkinssence Laser & Skincare Clinic\nTalwandi, Kota\n📞 +91 95091 97578`;
};
