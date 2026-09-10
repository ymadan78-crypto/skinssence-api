with open('backend/server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'medicines' in line.lower() or 'inventory' in line.lower():
        if 'm.name' in line or 'name' in line and 'FROM medicines' in line:
            print(f"Line {i+1}: {line.strip()}")
