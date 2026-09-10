
from libsql_client import create_client_sync

client = create_client_sync(
  url='libsql://skinssence-skinssence.aws-ap-south-1.turso.io',
  auth_token='eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc1NzI5MTMsImlkIjoiMDFhMDMzOWEtMTQwMS03OWFjLTlhNDQtY2MxNDQ5NGJjNTcyIiwia2lkIjoiR2FCTDVNaHZBYy1XRDh3SVBXbWlxcm9ZZ2ZxZmgxWGx5ajNORWpHVVc4MCIsInJpZCI6ImEwMWU3MTVhLTdiM2MtNDBiMS1iYWVlLWNjODJjMzU4MDI2NyJ9.iMhg3KM_Y-s1OyOfN5xisfSuZlE3i3dvyxjMgBC_vfwWs18Hb-btL6RSfpUQ_FvpMPnf7uDyJ3LT-CPI-7kpBQ'
)
rs = client.execute('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=\'patients\'')
print(rs.rows[0][0])

