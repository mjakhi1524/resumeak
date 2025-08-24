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
	"""Get or create Web3 client for the specified chain"""
	key = chain.lower()
	if key not in w3_clients:
		# Map chain names to environment variable names
		mapping = {
			"ethereum": "RPC_URL_ETHEREUM",
			"polygon": "RPC_URL_POLYGON",
			"arbitrum": "RPC_URL_ARBITRUM",
			"optimism": "RPC_URL_OPTIMISM",
			"base": "RPC_URL_BASE",
			"polygon_zkevm": "RPC_URL_POLYGON_ZKEVM",
		}
		env_name = mapping.get(key, "RPC_URL_ETHEREUM")
		url = os.getenv(env_name)
		print(f"Getting RPC URL for chain '{key}', env var '{env_name}': {url[:50] if url else 'NOT SET'}...")
		if not url:
			raise HTTPException(status_code=500, detail=f"Missing RPC URL for {key} (env var: {env_name})")
		try:
			w3_clients[key] = Web3(Web3.HTTPProvider(url))
			# Test the connection
			is_connected = w3_clients[key].is_connected()
			print(f"Web3 connection test for {key}: {'SUCCESS' if is_connected else 'FAILED'}")
			if not is_connected:
				raise HTTPException(status_code=500, detail=f"Could not connect to RPC for {key}")
		except Exception as e:
			print(f"Error creating Web3 client for {key}: {e}")
			raise HTTPException(status_code=500, detail=f"Failed to create Web3 client for {key}: {str(e)}")
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
	print(f"Sanctions check for {to_addr}: {sanctioned}")
	
	# Always compute fresh risk score instead of relying on cached values
	if features:
		# Convert features to domain objects
		hits = [f.to_domain() for f in features]
		print(f"Processing {len(hits)} risk features for {to_addr}")
		
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
		print(f"Risk assessment for {to_addr}: score={score}, band={band}, allowed={allowed}")
		return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status
	
	# No features provided - compute basic risk score based on sanctions and transaction context
	print(f"No risk features provided for {to_addr}, computing basic risk score")
	
	# Create basic risk features based on available context
	basic_features = []
	
	# Add sanctions as a critical feature if applicable
	if sanctioned:
		from datetime import datetime, timezone
		basic_features.append(FeatureHit(
			key="SANCTIONS",
			base=100.0,
			occurred_at=datetime.now(timezone.utc),
			critical=True,
			details={"address": to_addr, "source": "sanctioned_wallets_table"}
		))
	
	# Add transaction context risk if available
	if transaction_context:
		data_size = transaction_context.get('data_size', 0)
		is_contract = transaction_context.get('is_contract', False)
		
		if is_contract:
			from datetime import datetime, timezone
			basic_features.append(FeatureHit(
				key="CONTRACT_INTERACTION",
				base=50.0,
				occurred_at=datetime.now(timezone.utc),
				critical=False,
				details={"data_size": data_size, "is_contract": True}
			))
	
	# Compute risk score with basic features
	if basic_features:
		score, band, reasons, applied = compute_risk_score(
			basic_features,
			sanctioned,
			transaction_context=transaction_context,
			network_context=network_context
		)
	else:
		# No features at all - base score on sanctions only
		score = 100 if sanctioned else 0
		band = "PROHIBITED" if sanctioned else "LOW"
		reasons = ["SANCTIONS: Address found in sanctioned wallets list"] if sanctioned else []
	
	allowed, status, alert = _apply_policy(sanctioned, score, band)
	if alert:
		reasons = ["ALERT: risk_score==50"] + reasons
	
	print(f"Basic risk assessment for {to_addr}: score={score}, band={band}, allowed={allowed}, reasons={reasons}")
	return Decision(allowed=allowed, risk_band=band, risk_score=score, reasons=reasons), reasons, status


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
	print(f"=== RELAY REQUEST START ===")
	print(f"Partner ID: {partner_id}")
	print(f"Chain: {body.chain}")
	print(f"Raw TX length: {len(body.rawTx)}")
	print(f"Features provided: {len(body.features) if body.features else 0}")
	
	if not is_hex_string(body.rawTx):
		raise HTTPException(status_code=400, detail="rawTx must be 0x-hex string")

	to = extract_to_address(body.rawTx)
	if to is None:
		raise HTTPException(status_code=400, detail="Missing 'to' in rawTx (contract creation not supported)")
	
	print(f"Extracted 'to' address: {to}")

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
			print(f"Transaction context: {transaction_context}")
	except Exception as e:
		print(f"Warning: Could not parse transaction context: {e}")
	
	print(f"Calling make_decision_with_risk for address: {to}")
	decision, reasons, status = await make_decision_with_risk(to, body.features, transaction_context)
	print(f"Risk decision: allowed={decision.allowed}, score={decision.risk_score}, band={decision.risk_band}, reasons={reasons}")

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
		print(f"Transaction BLOCKED for {to}: {reasons}")
		return JSONResponse(status_code=403, content={
			"allowed": False,
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"reasons": reasons or decision.reasons,
			"status": "blocked",
		})

	print(f"Transaction ALLOWED for {to}, proceeding to broadcast...")
	# broadcast (allowed or alert)
	try:
		print(f"Attempting to broadcast transaction for chain: {body.chain}")
		w3 = get_w3(body.chain)
		print(f"Web3 instance created successfully")
		
		raw_bytes = Web3.to_bytes(hexstr=body.rawTx)
		print(f"Raw transaction converted to bytes, length: {len(raw_bytes)}")
		
		# Try to decode the transaction first to validate it
		try:
			from eth_account._utils.legacy_transactions import decode_transaction
			decoded_tx = decode_transaction(body.rawTx)
			print(f"Transaction decoded successfully, from: {decoded_tx['from']}, to: {decoded_tx['to']}, nonce: {decoded_tx['nonce']}")
		except Exception as decode_error:
			print(f"Warning: Could not decode transaction: {decode_error}")
		
		tx_hash = w3.eth.send_raw_transaction(raw_bytes)
		print(f"Transaction broadcast successful, hash: {tx_hash}")
		
		tx_hex = tx_hash.hex() if hasattr(tx_hash, "hex") else Web3.to_hex(tx_hash)
		if log_id is not None:
			try:
				sb.table("relay_logs").update({"tx_hash": tx_hex}).eq("id", log_id).execute()
			except Exception as log_error:
				print(f"Warning: Failed to update log with tx_hash: {log_error}")
		
		print(f"=== RELAY REQUEST SUCCESS ===")
		return JSONResponse(content={
			"allowed": True,
			"risk_band": decision.risk_band,
			"risk_score": decision.risk_score,
			"txHash": tx_hex,
			"reasons": reasons or decision.reasons,
			"status": status,
		})
	except Exception as e:
		print(f"Error broadcasting transaction: {e}")
		print(f"Error type: {type(e)}")
		print(f"Error args: {e.args}")
		
		# Check if it's a specific RPC error
		if hasattr(e, 'args') and len(e.args) > 0:
			error_msg = str(e.args[0])
			if "insufficient funds" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Insufficient funds for transaction")
			elif "nonce too low" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Nonce too low - transaction may already be mined")
			elif "already known" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Transaction already known to network")
			elif "intrinsic gas too low" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Gas limit too low for transaction")
			elif "invalid sender" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Invalid sender address")
			elif "eip-155" in error_msg.lower():
				raise HTTPException(status_code=400, detail="EIP-155 replay protection mismatch")
			elif "gas price below minimum" in error_msg.lower() or "gas tip cap" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Gas price too low - increase gas price or tip")
			elif "chain not found" in error_msg.lower():
				raise HTTPException(status_code=400, detail="Invalid chain specified - check chain parameter")
			else:
				raise HTTPException(status_code=502, detail=f"RPC error: {error_msg}")
		else:
			raise HTTPException(status_code=502, detail=f"Network error: {str(e)}")
