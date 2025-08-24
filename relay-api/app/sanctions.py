from __future__ import annotations

from typing import Tuple

from .supabase_client import get_supabase


class SanctionsChecker:
	async def load_initial(self) -> None:
		return None

	async def is_sanctioned(self, address: str) -> bool:
		try:
			addr = (address or "").lower()
			print(f"Checking sanctions for address: {addr}")
			
			sb = get_supabase()
			res = sb.table("sanctioned_wallets").select("address").eq("address", addr).limit(1).execute()
			rows = res.data or []
			
			is_sanctioned = bool(rows)
			print(f"Sanctions check result for {addr}: {is_sanctioned} (found {len(rows)} matches)")
			
			# Also check if the address exists in any case variation
			if not is_sanctioned:
				# Try to find any case variation
				res = sb.table("sanctioned_wallets").select("address").execute()
				all_sanctioned = res.data or []
				for sanctioned_addr in all_sanctioned:
					if sanctioned_addr.get("address", "").lower() == addr:
						is_sanctioned = True
						print(f"Found case-insensitive match: {sanctioned_addr.get('address')} matches {addr}")
						break
			
			return is_sanctioned
		except Exception as e:
			print(f"Error checking sanctions for {address}: {e}")
			# In case of error, err on the side of caution and block
			return True

	async def get_risk(self, address: str) -> Tuple[int, str]:
		addr = (address or "").lower()
		sb = get_supabase()
		res = sb.table("risk_scores").select("score,band").eq("wallet", addr).limit(1).execute()
		rows = res.data or []
		if not rows:
			return 0, "LOW"
		data = rows[0]
		score = round(data.get("score") or 0)
		band = data.get("band") or "LOW"
		return score, band
