with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("SELECT v.id as visit_id, v.visit_date as created_at, v.planned_procedures, u.name as doctor_name",
                    "SELECT v.id as visit_id, v.visit_date as created_at, v.planned_procedures, v.consultation_fee, u.name as doctor_name")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated with v.consultation_fee in patient visit history!")
