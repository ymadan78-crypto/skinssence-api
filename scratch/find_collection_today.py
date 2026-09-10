with open('backend/server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'collection' in line.lower() and 'today' in line.lower():
        print(f"Line {i+1}: {line.strip()}")
