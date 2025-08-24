import os
from supabase import create_client, Client

_client: Client | None = None


def get_supabase() -> Client:
	global _client
	if _client is None:
		url = os.getenv("SUPABASE_URL")
		key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		print(f"Creating Supabase client with URL: {url[:30] if url else 'NOT SET'}...")
		print(f"Service role key: {'SET' if key else 'NOT SET'} (length: {len(key) if key else 0})")
		
		if not url or not key:
			raise RuntimeError("Missing Supabase configuration")
		
		_client = create_client(url, key)
		print("✅ Supabase client created successfully")
		
	return _client
