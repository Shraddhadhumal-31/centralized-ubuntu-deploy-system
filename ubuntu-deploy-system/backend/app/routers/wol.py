import re
import socket
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import verify_token

router = APIRouter(prefix="/api/wol", tags=["wol"])


class WOLRequest(BaseModel):
    mac_addresses: List[str]


def send_magic_packet(mac: str) -> None:
    mac_clean = re.sub(r"[^A-Fa-f0-9]", "", mac)
    if len(mac_clean) != 12:
        raise ValueError(f"Invalid MAC address: {mac}")
    mac_bytes = bytes.fromhex(mac_clean)
    packet = b"\xff" * 6 + mac_bytes * 16
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        sock.sendto(packet, ("255.255.255.255", 9))
    finally:
        sock.close()


@router.post("")
async def wake_on_lan(
    req: WOLRequest, username: str = Depends(verify_token)
):
    if not req.mac_addresses:
        raise HTTPException(status_code=400, detail="No MAC addresses provided")

    sent, errors = [], []
    for mac in req.mac_addresses:
        try:
            send_magic_packet(mac)
            sent.append(mac)
        except Exception as e:
            errors.append({"mac": mac, "error": str(e)})

    return {
        "sent": sent,
        "errors": errors,
        "note": (
            "Wake-on-LAN packets were sent to the broadcast address. "
            "This does NOT guarantee the computers will power on. "
            "Requirements: (1) WOL enabled in BIOS/UEFI, "
            "(2) network adapter supports WOL, "
            "(3) Ethernet connection (not Wi-Fi), "
            "(4) computer in soft-off or sleep state. "
            "The system cannot verify whether the computers actually powered on."
        ),
    }
