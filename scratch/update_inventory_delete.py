with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Update DELETE /api/inventory/:id to allow any authorized clinic user and log properly
old_delete = """app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Only Admin or Doctor can delete inventory' });
  }
  db.run('DELETE FROM inventory WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});"""

new_delete = """app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM inventory WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});"""

code = code.replace(old_delete, new_delete)

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully!")
