import os
from typing import Optional, Dict, List, Any, Tuple

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


app = FastAPI(title="Relay API", version="1.2.0")


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
		# chain key → env var name
		mapping = {
			"ethereum": "RPC_URL_ETHEREUM",
			"eth": "RPC_URL_ETHEREUM",
			"polygon": "RPC_URL_POLYGON",
			"matic": "RPC_URL_POLYGON",
			"arbitrum": "RPC_URL_ARBITRUM",
			"arb": "RPC_URL_ARBITRUM",
			"optimism": "RPC_URL_OPTIMISM",
			"base": "RPC_URL_BASE",
			"zksync": "RPC_URL_ZKSYNC",
			"linea": "RPC_URL_LINEA",
			"scroll": "RPC_URL_SCROLL",
			"immutable": "RPC_URL_IMMUTABLE",
			"taiko": "RPC_URL_TAIKO",
			"bsc": "RPC_URL_BSC",
			"binance-smart-chain": "RPC_URL_BSC",
			"avalanche": "RPC_URL_AVALANCHE",
			"avax": "RPC_URL_AVALANCHE",
			"fantom": "RPC_URL_FANTOM",
			"ftm": "RPC_URL_FANTOM",
			"gnosis": "RPC_URL_GNOSIS",
			"celo": "RPC_URL_CELO",
			"moonbeam": "RPC_URL_MOONBEAM",
			"aurora": "RPC_URL_AURORA",
			"cronos": "RPC_URL_CRONOS",
			"mantle": "RPC_URL_MANTLE",
			"polygon-zkevm": "RPC_URL_POLYGON_ZKEVM",
			"polygon_zkevm": "RPC_URL_POLYGON_ZKEVM",
		}
		env_name = mapping.get(key, "RPC_URL_ETHEREUM")
		url = os.getenv(env_name)
		if not url:
			raise HTTPException(status_code=500, detail=f"Missing RPC URL for {key}")
		w3_clients[key] = Web3(Web3.HTTPProvider(url))
	return w3_clients[key]


sanctions_checker = SanctionsChecker()


@app.on_event("startup")
async def startup_event() -> None:
	await sanctions_checker.load_initial()


def _apply_policy(sanctioned: bool, score: int, band: str) -> Tuple[bool, Optional[str], bool]:
	"""Return (allowed, status, alert)
	Policy:
	- score==100 or sanctioned/PROHIBITED => block (status='blocked')
	- score==50 => allow with alert (status='alert')
	- score==0 => allow
	- HIGH/CRITICAL (>=80) => block
	- else allow
	"""
	if sanctioned or band == "PROHIBITED" or score >= 100:
		return False, "blocked", False
	if score == 50:
		return True, "alert", True
	if score == 0:
		return True, None, False
	if band in {"HIGH", "CRITICAL"} or score >= 80:
		return False, "blocked", False
	return True, None, False


async def make_decision_with_risk(to_addr: str, features: Optional[List[FeatureHitIn]]) -> tuple[Decision, List[str], Optional[str]]:
	"""If features provided: compute risk now; else fall back to DB cached risk.
	Returns (Decision, reasons, status)
	"""
	reasons: List[str] = []
	sanctioned = await sanctions_checker.is_sanctioned(to_addr)
	if features:
		hits = [f.to_domain() for f in features]
		score, band, reasons, applied = compute_risk_score(hits, sanctioned)
		try:
			log_risk_events(to_addr, hits, applied)
			upsert_risk_score(to_addr, score, band)
		except Exception:
			pass
		allowed, status, alert = _apply_policy(sanctioned, score, band)
		if alert:
			reasons = ["ALERT: risk_score==50"] + reasons
		return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status
	# fallback to DB snapshot
	sb = get_supabase()
	res = sb.table("risk_scores").select("score,band").eq("wallet", (to_addr or "").lower()).limit(1).execute()
	rows = res.data or []
	if rows:
		data = rows[0]
		score = int(round(data.get("score") or 0))
		band = data.get("band") or "LOW"
		allowed, status, alert = _apply_policy(sanctioned, score, band)
		if alert:
			reasons = ["ALERT: risk_score==50"]
		return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status
	# no cached score → treat as 0
	allowed, status, _ = _apply_policy(sanctioned, 0, "LOW")
	return Decision(allowed=allowed, risk_band="LOW", risk_score=0, reasons=[]), [], status


@app.post("/v1/check", response_model=Decision)
async def v1_check(body: CheckRequest, partner_id: str = Depends(get_partner_id_from_api_key)):
	decision, reasons, status = await make_decision_with_risk(body.to, body.features)
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
			"reasons": reasons or decision.reasons,
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

	decision, reasons, status = await make_decision_with_risk(to, body.features)

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
			"reasons": reasons or decision.reasons,
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
			"reasons": reasons or decision.reasons,
			"status": "blocked",
		})

	# broadcast (allowed or alert)
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
			"reasons": reasons or decision.reasons,
			"status": status,
		})
	except Exception as e:
		raise HTTPException(status_code=502, detail=f"network_error: {e}")
