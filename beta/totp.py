#!/usr/bin/env python3
"""Generate a Steam Guard TOTP code from a base64 shared_secret.

Reads STEAM_SHARED_SECRET (base64) from the environment and prints the
5-character code for the current 30 second window. Used by CI to satisfy
Steam Guard 2FA on every steamcmd login without storing session state.
"""

from __future__ import annotations

import base64
import hmac
import hashlib
import os
import struct
import sys
import time

STEAM_ALPHABET = "23456789BCDFGHJKMNPQRTVWXY"


def main() -> None:
    raw = os.environ.get("STEAM_SHARED_SECRET", "").strip()
    if not raw:
        sys.exit("STEAM_SHARED_SECRET env var is required")

    secret = base64.b64decode(raw)
    counter = struct.pack(">Q", int(time.time()) // 30)
    mac = hmac.new(secret, counter, hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code_int = int.from_bytes(mac[offset : offset + 4], "big") & 0x7FFFFFFF

    chars = []
    for _ in range(5):
        chars.append(STEAM_ALPHABET[code_int % len(STEAM_ALPHABET)])
        code_int //= len(STEAM_ALPHABET)
    print("".join(chars))


if __name__ == "__main__":
    main()
