#!/usr/bin/env python3
"""Validate an immutable release archive before tar can write anything."""
import hashlib
import os
import pathlib
import sys
import tarfile

COMPONENTS = {"backend", "frontend", "website"}
HELPERS = {"contact-change.cjs", "contact-guards.cjs", "contact-journal.cjs", "contact-evidence.cjs", "release-safety.py"}


def validate(filename, expected):
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
        raise ValueError("a reviewed SHA-256 is required")
    if os.path.islink(filename) or not os.path.isfile(filename) or os.stat(filename).st_size > 512 * 1024**2:
        raise ValueError("archive must be a bounded regular file")
    digest = hashlib.sha256()
    with open(filename, "rb") as archive:
        for chunk in iter(lambda: archive.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError("artifact checksum mismatch")
    seen, total, count, packages = set(), 0, 0, set()
    with tarfile.open(filename, "r|gz") as archive:
        for member in archive:
            name = member.name.rstrip("/")
            parts = name.split("/")
            if not name or name.startswith("/") or "\\" in name or any(p in ("", ".", "..") for p in parts):
                raise ValueError("unsafe archive path")
            if any(ord(c) < 32 or ord(c) == 127 for c in name) or len(name) > 512:
                raise ValueError("unsafe archive name")
            source = parts[0] == "agents" and len(parts) >= 2 and parts[1] in COMPONENTS
            helper = parts[0] == "deploy" and (len(parts) == 1 and member.isdir() or len(parts) == 2 and parts[1] in HELPERS)
            if not source and not helper and not (name == "agents" and member.isdir()):
                raise ValueError("unexpected artifact root")
            if not member.isdir() and not member.isfile() or member.mode & 0o7000:
                raise ValueError("links, devices and privileged modes are forbidden")
            if any(p.startswith(".env") or p in ("node_modules", ".git", "uploads", "logs", "backups") for p in parts):
                raise ValueError("secret/persistent/runtime path in artifact")
            destination = "/".join(parts[1:])
            if destination and destination in seen:
                raise ValueError("duplicate extraction destination")
            if destination:
                seen.add(destination)
            count += 1
            total += member.size
            if count > 100_000 or total > 2 * 1024**3:
                raise ValueError("artifact extraction budget exceeded")
            if source and len(parts) == 3 and parts[2] == "package.json" and member.isfile():
                packages.add(parts[1])
    if packages != COMPONENTS or not HELPERS.issubset(seen):
        raise ValueError("required components or guard helpers missing")
    return total


if __name__ == "__main__":
    try:
        print(validate(sys.argv[1], sys.argv[2]))
    except (IndexError, ValueError, OSError, tarfile.TarError):
        sys.exit("BLOCKED: release archive validation failed")
