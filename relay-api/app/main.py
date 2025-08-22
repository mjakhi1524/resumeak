import os
from typing import Optional, Dict, List, Any, Tuple

from fastapi import FastAPI, Header, HTTPException, Depends, Security
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.utils import get_openapi
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

	# Provide Swagger example so the UI is pre-filled with valid data
	model_config = ConfigDict(
		populate_by_name=True,
		json_schema_extra={
			"example": {
				"chain": "ethereum",
				"to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
				"from": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
				"value": "1000000000000000000",
				"asset": "ETH",
				"features": [
					{ "key": "value_gt_10k", "base": 10, "occurredAt": "2025-08-21T10:00:00Z" }
				]
			}
		}
	)


class RelayRequest(BaseModel):
	chain: str = Field(default="ethereum")
	rawTx: str
	idempotencyKey: Optional[str] = None
	features: Optional[List[FeatureHitIn]] = None

	model_config = ConfigDict(
		json_schema_extra={
			"example": {
				"chain": "ethereum",
				"rawTx": "0x02f86b01843b9aca00847735940082520894b60e8dd61c5d32be8058bb8eb970870f07233155080c080a0...",
				"idempotencyKey": "example-key-123",
				"features": [ { "key": "value_gt_10k", "base": 10, "occurredAt": "2025-08-21T10:00:00Z" } ]
			}
		}
	)


class RelayResponse(BaseModel):
	allowed: bool
	risk_band: str
	risk_score: int
	txHash: Optional[str] = None
	reasons: Optional[List[str]] = None
	status: Optional[str] = None


app = FastAPI(
    title="Relay API", 
    version="1.2.0",
    openapi_tags=[{"name": "default", "description": "Relay API endpoints"}]
)

# CORS for frontend
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080")
origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
allow_credentials = os.getenv("ALLOW_CORS_CREDENTIALS", "false").lower() == "true"
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Configure OpenAPI security scheme for Swagger UI
app.openapi_schema = None  # Force regeneration
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version="3.0.2",
        description="Relay API for blockchain risk assessment and transaction relay",
        routes=app.routes,
    )
    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "API Key"
        }
    }
    # Apply security to all endpoints
    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


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

bearer_scheme = HTTPBearer(auto_error=False)

def get_partner_id_from_api_key(authorization: Optional[str] = Header(default=None)) -> str:
	# Support both "Bearer <key>" and raw key in Authorization header,
	# and also FastAPI HTTPBearer if configured later.
	api_key = None
	if authorization:
		api_key = authorization[7:] if authorization.startswith("Bearer ") else authorization
	if not api_key:
		raise HTTPException(status_code=401, detail="Missing API key")
	
	try:
		sb = get_supabase()
		# Try to find by key_hash first (primary storage), then by key (fallback)
		res = sb.table("api_keys").select("partner_id,is_active").eq("key_hash", api_key).limit(1).execute()
		rows = res.data or []
		if not rows:
			# Fallback to key column if key_hash not found
			res = sb.table("api_keys").select("partner_id,is_active").eq("key", api_key).limit(1).execute()
			rows = res.data or []
		
		row = rows[0] if rows else None
		if not row:
			raise HTTPException(status_code=403, detail="API key not found")
		if not row.get("is_active"):
			raise HTTPException(status_code=403, detail="API key is inactive")
		
		partner_id = row.get("partner_id")
		if not partner_id:
			raise HTTPException(status_code=500, detail="API key missing partner_id")
		
		return str(partner_id)
	except HTTPException:
		raise
	except Exception as e:
		print(f"Error validating API key: {e}")
		raise HTTPException(status_code=500, detail="Internal server error during API key validation")


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


async def make_decision_with_risk(to_addr: str, features: Optional[List[FeatureHitIn]], 
                                 transaction_context: Optional[Dict] = None,
                                 network_context: Optional[Dict] = None) -> tuple[Decision, List[str], Optional[str]]:
	"""Enhanced risk assessment using the new enterprise risk model.
	Returns (Decision, reasons, status)
	"""
	reasons: List[str] = []
	sanctioned = await sanctions_checker.is_sanctioned(to_addr)
	
	if features:
		# Convert features to domain objects
		hits = [f.to_domain() for f in features]
		
		# Use new risk model with context
		score, band, reasons, applied = compute_risk_score(
			hits, 
			sanctioned,
			transaction_context=transaction_context,
			network_context=network_context
		)
		
		try:
			# Enhanced logging with new model
			log_risk_events(to_addr, hits, applied)
			upsert_risk_score(to_addr, score, band, reasons)
		except Exception as e:
			print(f"Warning: Failed to log risk data: {e}")
		
		allowed, status, alert = _apply_policy(sanctioned, score, band)
		if alert:
			reasons = ["ALERT: risk_score==50"] + reasons
		return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status
	
	# Fallback to DB snapshot
	sb = get_supabase()
	res = sb.table("risk_scores").select("score,band,risk_factors").eq("wallet", (to_addr or "").lower()).limit(1).execute()
	rows = res.data or []
	
	if rows:
		data = rows[0]
		score = int(round(data.get("score") or 0))
		band = data.get("band") or "LOW"
		reasons = data.get("risk_factors") or []
		
		allowed, status, alert = _apply_policy(sanctioned, score, band)
		if alert:
			reasons = ["ALERT: risk_score==50"] + reasons
		return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status
	
	# No cached score → treat as 0
	allowed, status, _ = _apply_policy(sanctioned, 0, "LOW")
	return Decision(allowed=allowed, risk_band="LOW", risk_score=0, reasons=[]), [], status


@app.post("/v1/check", response_model=Decision)
async def v1_check(body: CheckRequest, partner_id: str = Depends(get_partner_id_from_api_key)):
	try:
		# Validate request body: accept 0x-prefixed 40-hex EVM address
		if not body.to or not isinstance(body.to, str):
			raise HTTPException(status_code=400, detail="Missing 'to' address")
		to_norm = body.to.strip()
		if to_norm.lower() == "string":
			raise HTTPException(status_code=400, detail="Invalid 'to' address. Use a real 0x... address (see example in docs).")
		if not (to_norm.startswith("0x") and len(to_norm) == 42):
			raise HTTPException(status_code=400, detail="Invalid 'to' address format. Expected 0x-prefixed EVM address.")
		
		print(f"Processing check request for partner_id: {partner_id}, to: {to_norm}")
		decision, reasons, status = await make_decision_with_risk(to_norm, body.features)
		print(f"Decision: {decision.allowed}, risk_score: {decision.risk_score}, risk_band: {decision.risk_band}")
		
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
		except Exception as e:
			print(f"Warning: Failed to log request: {e}")
		
		return JSONResponse(content=decision.model_dump())
	except HTTPException:
		raise
	except Exception as e:
		print(f"Error in v1_check: {e}")
		raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/v1/relay", response_model=RelayResponse)
async def v1_relay(body: RelayRequest, partner_id: str = Depends(get_partner_id_from_api_key)):
	if not is_hex_string(body.rawTx):
		raise HTTPException(status_code=400, detail="rawTx must be 0x-hex string")

	to = extract_to_address(body.rawTx)
	if to is None:
		raise HTTPException(status_code=400, detail="Missing 'to' in rawTx (contract creation not supported)")

	# Extract transaction context for enhanced risk scoring
	transaction_context = None
	try:
		# Parse raw transaction to get basic info
		raw_bytes = Web3.to_bytes(hexstr=body.rawTx)
		if len(raw_bytes) > 0:
			# Basic transaction analysis
			transaction_context = {
				"data_size": len(raw_bytes),
				"is_contract": len(raw_bytes) > 21000,  # More than basic ETH transfer
				"raw_tx_length": len(body.rawTx)
			}
	except Exception as e:
		print(f"Warning: Could not parse transaction context: {e}")
	
	decision, reasons, status = await make_decision_with_risk(to, body.features, transaction_context)

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
