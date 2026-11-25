"""School-network helpers for attendance check-in.

Client IP resolution:
- Default: use only the direct socket address (request.client.host).
- X-Forwarded-For and X-Real-IP are ignored unless TRUST_PROXY_HEADERS=true.
  When that flag is on, the rightmost forwarded hop is used (the address the
  immediate proxy should have added). The leftmost hop is not used, because a
  public client can spoof it.

Enforcement:
- Off when there are no enabled school_networks rows and SCHOOL_NETWORKS is empty.
  This keeps Codespaces / local testing working before the real school IP is known.
- On automatically once at least one enabled DB row or env CIDR is configured.
- Applies to student self check-in only (POST /api/attendance/checkin and the
  chatbot check_in_attendance tool). Teachers are not blocked.
"""
from __future__ import annotations

import ipaddress
from typing import Iterable, List, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .database import settings
from .models import SchoolNetwork

CHECKIN_DENIED_DETAIL = "Attendance can only be marked from a school computer."


def parse_cidr(value: str) -> Optional[ipaddress._BaseNetwork]:
    """Parse a single IPv4/IPv6 address or CIDR. Returns None if invalid."""
    text = (value or "").strip()
    if not text:
        return None
    try:
        if "/" in text:
            return ipaddress.ip_network(text, strict=False)
        return ipaddress.ip_network(ipaddress.ip_address(text))
    except ValueError:
        return None


def normalize_cidr_input(value: str) -> str:
    """Validate and canonicalise a user-supplied address or CIDR.

    Single hosts are stored without a prefix (10.1.3.40) so they stay readable.
    Ranges are stored in canonical form (10.1.2.0/24).
    """
    net = parse_cidr(value)
    if net is None:
        raise ValueError("Invalid IP or CIDR")
    if net.prefixlen == net.max_prefixlen:
        return str(net.network_address)
    return str(net)


def networks_from_csv(raw: str) -> List[ipaddress._BaseNetwork]:
    nets: List[ipaddress._BaseNetwork] = []
    for part in (raw or "").split(","):
        net = parse_cidr(part)
        if net is not None:
            nets.append(net)
    return nets


def env_networks() -> List[ipaddress._BaseNetwork]:
    return networks_from_csv(getattr(settings, "school_networks", "") or "")


def db_enabled_networks(db: Session) -> List[ipaddress._BaseNetwork]:
    rows = db.query(SchoolNetwork).filter(SchoolNetwork.enabled.is_(True)).all()
    nets: List[ipaddress._BaseNetwork] = []
    for row in rows:
        net = parse_cidr(row.cidr)
        if net is not None:
            nets.append(net)
    return nets


def configured_networks(db: Session) -> List[ipaddress._BaseNetwork]:
    """Enabled DB rows plus SCHOOL_NETWORKS env (override / seed source)."""
    combined: List[ipaddress._BaseNetwork] = []
    seen = set()
    for net in db_enabled_networks(db) + env_networks():
        key = str(net)
        if key not in seen:
            seen.add(key)
            combined.append(net)
    return combined


def enforcement_active(db: Session) -> bool:
    return bool(configured_networks(db))


def normalize_ip(raw: str) -> Optional[str]:
    text = (raw or "").strip().strip("[]")
    if not text:
        return None
    # IPv4 with a port, e.g. 10.1.2.3:1234 — never split IPv6 this way.
    if text.count(":") == 1 and "." in text:
        text = text.split(":", 1)[0]
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return str(ip.ipv4_mapped)
    return str(ip)


def get_client_ip(request: Request) -> Optional[str]:
    """Return the client IP used for attendance gating, or None if unknown."""
    direct = None
    if request.client and request.client.host:
        direct = normalize_ip(request.client.host)

    if not bool(getattr(settings, "trust_proxy_headers", False)):
        return direct

    forwarded = request.headers.get("x-forwarded-for") or ""
    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    for hop in reversed(hops):
        ip = normalize_ip(hop)
        if ip:
            return ip

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        ip = normalize_ip(real_ip)
        if ip:
            return ip
    return direct


def _as_address(ip_str: str):
    ip = ipaddress.ip_address(ip_str)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return ip.ipv4_mapped
    return ip


def ip_in_networks(ip_str: Optional[str], networks: Iterable[ipaddress._BaseNetwork]) -> bool:
    if not ip_str:
        return False
    try:
        ip = _as_address(ip_str)
    except ValueError:
        return False
    for net in networks:
        try:
            if ip in net:
                return True
        except TypeError:
            # IPv4 address vs IPv6 network (or the reverse)
            continue
    return False


def recorded_client_ip(request: Request) -> Optional[str]:
    """Value stored on the attendance row.

    Prefer a normalised IP. If the socket host is not a valid IP (unusual, but
    TestClient and some proxies do this), store the raw host so the check-in
    is still attributable. Gating always uses get_client_ip(), not this raw
    fallback.
    """
    ip = get_client_ip(request)
    if ip:
        return ip
    if request.client and request.client.host:
        return str(request.client.host)[:64]
    return None


def require_school_ip_for_student(request: Request, db: Session, user) -> Optional[str]:
    """Record and, for students, optionally enforce the school-IP rule.

    Teachers are never blocked (they may administer attendance from anywhere).
    Students are blocked with HTTP 403 only when at least one school network is
    configured and the request IP is not in that list.
    """
    client_ip = get_client_ip(request)
    if getattr(user, "role", None) != "teacher":
        networks = configured_networks(db)
        if networks and not ip_in_networks(client_ip, networks):
            raise HTTPException(status_code=403, detail=CHECKIN_DENIED_DETAIL)
    return recorded_client_ip(request)
