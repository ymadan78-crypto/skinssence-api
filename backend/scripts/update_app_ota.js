const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../mobile/App.js');
let content = fs.readFileSync(filePath, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add import * as Updates
content = content.replace(
  "import { View, Text, TouchableOpacity } from 'react-native';",
  "import { View, Text, TouchableOpacity } from 'react-native';\nimport * as Updates from 'expo-updates';"
);

// 2. Add useEffect in App()
const targetApp = `export default function App() {
  return (`;

const replaceApp = `export default function App() {
  React.useEffect(() => {
    async function checkOta() {
      if (__DEV__) return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log('[EAS Updates] Check skipped or offline:', e.message);
      }
    }
    checkOta();
  }, []);

  return (`;

content = content.replace(targetApp, replaceApp);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.js updated with auto OTA reload!');
