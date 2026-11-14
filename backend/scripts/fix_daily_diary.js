const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../mobile/screens/DailyDiaryScreen.js');
let content = fs.readFileSync(filePath, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add missing state variables
const targetState = `  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [correctingVisitId, setCorrectingVisitId] = useState(null);`;

const replaceState = `  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [correctingVisitId, setCorrectingVisitId] = useState(null);
  const [editBillModalVisible, setEditBillModalVisible] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState(null);`;

content = content.replace(targetState, replaceState);

// 2. Add initialVisit to EditBillModal
const targetModal = `<EditBillModal
        visible={editBillModalVisible}
        visitId={editingVisitId}`;

const replaceModal = `<EditBillModal
        visible={editBillModalVisible}
        visitId={editingVisitId}
        initialVisit={diaryData?.timeline?.find(t => t.visit_id === editingVisitId)}`;

content = content.replace(targetModal, replaceModal);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('DailyDiaryScreen.js successfully fixed!');
