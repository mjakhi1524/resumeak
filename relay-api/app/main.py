import os
from typing import Optional, Dict, List, Any

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
from web3 import Web3

from .supabase_client import get_supabase
from .sanctions import SanctionsChecker
from .tx_decode import extract_to_address, is_hex_string
from .utils import Decision, decision_from, now_iso
from .risk_model import FeatureHit, compute_risk_score, log_risk_events, upsert_risk_score


class FeatureHitIn(BaseModel):
	key: str
	base: float
	occurredAt: str
	critical: Optional[bool] = False
	details: Optional[dict[str, Any]] = None

	model_config = ConfigDict(extra="ignore")

	def to_domain(self) -> FeatureHit:
		# occurredAt expected as ISO 8601
		from datetime import datetime
		from datetime import timezone as tz
		occurred_at = datetime.fromisoformat(self.occurredAt.replace("Z", "+00:00")).astimezone(tz.utc)
		return FeatureHit(
			key=self.key,
			base=float(self.base),
			occurred_at=occurred_at,
			critical=bool(self.critical),
			details=self.details or {},
		)


class CheckRequest(BaseModel):
	chain: str = Field(default="ethereum")
	to: str
	from_addr: Optional[str] = Field(default=None, alias="from")
	value: Optional[str] = None
	asset: Optional[str] = None
	features: Optional[List[FeatureHitIn]] = None

	model_config = ConfigDict(populate_by_name=True)


class RelayRequest(BaseModel):
	chain: str = Field(default="ethereum")
	rawTx: str
	idempotencyKey: Optional[str] = None
	features: Optional[List[FeatureHitIn]] = None


class RelayResponse(BaseModel):
	allowed: bool
	risk_band: str
	risk_score: int
	txHash: Optional[str] = None
	reasons: Optional[List[str]] = None
	status: Optional[str] = None


app = FastAPI(title="Relay API", version="1.1.0")


def get_partner_id_from_api_key(authorization: Optional[str] = Header(default=None)) -> str:
	if not authorization or not authorization.startswith("Bearer "):
		raise HTTPException(status_code=401, detail="Missing API key")
	api_key = authorization[7:]
	sb = get_supabase()
	res = sb.table("api_keys").select("partner_id,active").eq("key", api_key).limit(1).execute()
	rows = res.data or []
	row = rows[0] if rows else None
	if not row or not row.get("active"):
		raise HTTPException(status_code=403, detail="Invalid API key")
	return str(row.get("partner_id"))


w3_clients: Dict[str, Web3] = {}

def get_w3(chain: str) -> Web3:
	key = chain.lower()
	if key not in w3_clients:
		env_name = {
			"ethereum": "RPC_URL_ETHEREUM",
			"polygon": "RPC_URL_POLYGON",
			"arbitrum": "RPC_URL_ARBITRUM",
			"optimism": "RPC_URL_OPTIMISM",
		}.get(key, "RPC_URL_ETHEREUM")
		url = os.getenv(env_name)
		if not url:
			raise HTTPException(status_code=500, detail=f"Missing RPC URL for {key}")
		w3_clients[key] = Web3(Web3.HTTPProvider(url))
	return w3_clients[key]


sanctions_checker = SanctionsChecker()


@app.on_event("startup")
async def startup_event() -> None:
	await sanctions_checker.load_initial()


def make_decision_with_risk(to_addr: str, features: Optional[List[FeatureHitIn]]) -> tuple[Decision, List[str]]:
	"""If features provided: compute risk now; else fall back to DB cached risk.
	Returns (Decision, reasons)
	"""
	reasons: List[str] = []
	sanctioned = await_sanction_check(to_addr)
	if features:
		# compute from provided evidence
		hits = [f.to_domain() for f in features]
		score, band, reasons, applied = compute_risk_score(hits, sanctioned)
		# persist evidence and score (best-effort)
		try:
			log_risk_events(to_addr, hits, applied)
			upsert_risk_score(to_addr, score, band)
		except Exception:
			pass
		allowed = not sanctioned and (band not in {"HIGH", "CRITICAL"}) and score < 80
		decision = Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons)
		return decision, reasons
	# fallback to DB snapshot
	score, band = get_cached_risk(to_addr)
	decision = decision_from(sanctioned, score, band)
	return decision, decision.reasons


def await_sanction_check(address: str) -> bool:
	# small wrapper in case we later add caching; keep sync signature for main path
	import asyncio
	return asyncio.get_event_loop().run_until_complete(sanctions_checker.is_sanctioned(address))


def get_cached_risk(address: str) -> tuple[int, str]:
	sb = get_supabase()
	res = sb.table("risk_scores").select("score,band").eq("wallet", (address or "").lower()).limit(1).execute()
	rows = res.data or []
	if not rows:
		return 0, "LOW"
	data = rows[0]
	return int(round(data.get("score") or 0)), data.get("band") or "LOW"


@app.post("/v1/check", response_model=Decision)
async def v1_check(body: CheckRequest, partner_id: str = Depends(get_partner_id_from_api_key)):
	decision, reasons = make_decision_with_risk(body.to, body.features)
	# log (best-effort)
	try:
		sb = get_supabase()
		sb.table("relay_logs").insert({
			"partner_id": partner_id,
			"chain": body.chain,
			"from_addr": body.from_addr or None,
			"to_addr": body.to,
			"decision": "allowed" if decision.allowed else "blocked",
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"reasons": reasons,
			"created_at": now_iso(),
		}).execute()
	except Exception:
		pass
	return JSONResponse(content=decision.model_dump())


@app.post("/v1/relay", response_model=RelayResponse)
async def v1_relay(body: RelayRequest, partner_id: str = Depends(get_partner_id_from_api_key)):
	if not is_hex_string(body.rawTx):
		raise HTTPException(status_code=400, detail="rawTx must be 0x-hex string")

	to = extract_to_address(body.rawTx)
	if to is None:
		raise HTTPException(status_code=400, detail="Missing 'to' in rawTx (contract creation not supported)")

	decision, reasons = make_decision_with_risk(to, body.features)

	# pre-log
	log_id: Optional[int] = None
	sb = get_supabase()
	try:
		ins = sb.table("relay_logs").insert({
			"partner_id": partner_id,
			"chain": body.chain,
			"from_addr": None,
			"to_addr": to,
			"decision": "allowed" if decision.allowed else "blocked",
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"reasons": reasons,
			"idempotency_key": body.idempotencyKey or None,
			"created_at": now_iso(),
		}).select("id").execute()
		rows = ins.data or []
		if rows:
			log_id = rows[0].get("id")
	except Exception:
		pass

	if not decision.allowed:
		return JSONResponse(status_code=403, content={
			"allowed": False,
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"reasons": reasons,
			"status": "blocked",
		})

	# broadcast
	try:
		w3 = get_w3(body.chain)
		raw_bytes = Web3.to_bytes(hexstr=body.rawTx)
		tx_hash = w3.eth.send_raw_transaction(raw_bytes)
		tx_hex = tx_hash.hex() if hasattr(tx_hash, "hex") else Web3.to_hex(tx_hash)
		if log_id is not None:
			try:
				sb.table("relay_logs").update({"tx_hash": tx_hex}).eq("id", log_id).execute()
			except Exception:
				pass
		return JSONResponse(content={
			"allowed": True,
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"txHash": tx_hex,
			"reasons": reasons,
		})
	except Exception as e:
		raise HTTPException(status_code=502, detail=f"network_error: {e}")
