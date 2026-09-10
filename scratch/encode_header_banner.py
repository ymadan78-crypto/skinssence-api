import base64

with open('mobile/assets/skinssence_name_logo_tagline.jpeg', 'rb') as f:
    data = base64.b64encode(f.read()).decode('utf-8')

js_content = f'export const HEADER_BANNER_BASE64 = "data:image/jpeg;base64,{data}";\n'
with open('mobile/utils/header_banner.js', 'w') as f:
    f.write(js_content)

print(f"Header banner encoded successfully. Length: {len(data)} chars")
