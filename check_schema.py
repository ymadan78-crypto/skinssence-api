
import os
from dotenv import load_dotenv
from libsql_client import create_client_sync

load_dotenv('backend/.env')
load_dotenv('.env')

client = create_client_sync(
  url=os.environ.get('TURSO_DATABASE_URL'),
  auth_token=os.environ.get('TURSO_AUTH_TOKEN')
)
rs = client.execute('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=\'patients\'')
print(rs.rows[0][0])

