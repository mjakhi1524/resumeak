from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import exp
from typing import Any, Dict, List, Tuple

from .supabase_client import get_supabase


@dataclass
class FeatureHit:
	key: str
	base: float
	occurred_at: datetime
	critical: bool = False
	# free-form evidence for explainability
	details: Dict[str, Any] | None = None


DEFAULT_HALF_LIFE_DAYS_BY_PREFIX: Dict[str, int] = {
	"mixer": 90,
	"sanctions": 90,
	"behavior": 30,
	"velocity": 30,
	"value": 14,
}


def _half_life_for_key(key: str, override: Dict[str, int] | None) -> int:
	if override and key in override:
		return override[key]
	for prefix, hl in DEFAULT_HALF_LIFE_DAYS_BY_PREFIX.items():
		if key.startswith(prefix):
			return hl
	return 30


def _decay(weight: float, occurred_at: datetime, half_life_days: int) -> float:
	age_days = max(0.0, (datetime.now(timezone.utc) - occurred_at.astimezone(timezone.utc)).total_seconds() / 86400.0)
	return weight * exp(-(age_days / max(1.0, float(half_life_days))))


def _soft_cap(sum_weights: float) -> float:
	return 100.0 * (1.0 - exp(-(sum_weights / 100.0)))


def band_for_score(score: float) -> str:
	if score >= 100.0:
		return "PROHIBITED"
	if score >= 80.0:
		return "CRITICAL"
	if score >= 60.0:
		return "HIGH"
	if score >= 30.0:
		return "MEDIUM"
	return "LOW"


def compute_risk_score(hits: List[FeatureHit], sanctions_match: bool,
						 half_life_overrides: Dict[str, int] | None = None) -> Tuple[int, str, List[str], List[Tuple[str, int]]]:
	"""Returns (score, band, reasons, contributions)
	contributions: list of (feature_key, applied_weight_int)
	"""
	if sanctions_match:
		return 100, "PROHIBITED", ["OFAC match (sanctioned_wallets)"], [("sanctions_match", 100)]

	critical = False
	S = 0.0
	reasons: List[str] = []
	contribs: List[Tuple[str, int]] = []
	for h in hits:
		hl = _half_life_for_key(h.key, half_life_overrides)
		w = _decay(h.base, h.occurred_at, hl)
		w = max(0.0, min(w, 100.0))
		S += w
		applied = int(round(w))
		contribs.append((h.key, applied))
		# human-readable reason
		if h.details:
			reasons.append(f"+{applied} {h.key} ({_summarize_details(h.details)})")
		else:
			reasons.append(f"+{applied} {h.key}")
		if h.critical:
			critical = True

	score = _soft_cap(S)
	if critical:
		score = max(score, 80.0)

	score_int = int(round(score))
	band = band_for_score(score_int)
	return score_int, band, reasons, contribs


def _summarize_details(details: Dict[str, Any]) -> str:
	parts: List[str] = []
	for k, v in details.items():
		parts.append(f"{k}={v}")
	return ", ".join(parts)


# Persistence helpers (optional)

def log_risk_events(wallet: str, hits: List[FeatureHit], applied: List[Tuple[str, int]]) -> None:
	sb = get_supabase()
	rows: List[Dict[str, Any]] = []
	for hit, (key, weight_applied) in zip(hits, applied):
		rows.append({
			"wallet": wallet.lower(),
			"feature": key,
			"details": hit.details or {},
			"weight_applied": weight_applied,
		})
	if rows:
		# Best-effort insert
		try:
			sb.table("risk_events").insert(rows).execute()
		except Exception:
			pass


def upsert_risk_score(wallet: str, score: int, band: str) -> None:
	sb = get_supabase()
	try:
		sb.table("risk_scores").upsert({
			"wallet": wallet.lower(),
			"score": score,
			"band": band,
		}).execute()
	except Exception:
		pass
