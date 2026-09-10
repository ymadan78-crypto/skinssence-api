import base64
import os

logo_path = r'mobile\assets\skinssence_logo.png'

if os.path.exists(logo_path):
    with open(logo_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('utf-8')
    
    # Write as a JS constant file
    js_content = f'export const LOGO_BASE64 = "data:image/png;base64,{data}";\n'
    with open(r'mobile\utils\logo.js', 'w') as f:
        f.write(js_content)
    
    print(f"Logo encoded successfully. Length: {len(data)} chars")
else:
    # Check alternate locations
    for root, dirs, files in os.walk('mobile'):
        for file in files:
            if 'logo' in file.lower() or 'skinssence' in file.lower():
                print(f"Found: {os.path.join(root, file)}")
