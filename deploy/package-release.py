#!/usr/bin/env python3
"""Package committed bytes only; ignored/untracked runtime files never enter a release."""
import os
import pathlib
import re
import subprocess
import sys
import tarfile

PATHS = ["agents/backend", "agents/frontend", "agents/website", "deploy/contact-change.cjs",
         "deploy/contact-guards.cjs", "deploy/contact-journal.cjs", "deploy/contact-evidence.cjs", "deploy/release-safety.py"]


def source_member(name):
    parts = pathlib.PurePosixPath(name).parts
    if any(p.startswith(".env") or p in {"node_modules", ".git", "uploads", "logs", "backups"} for p in parts):
        return False
    return not (len(parts) >= 3 and parts[0] == "agents" and parts[2] in {"dist", ".next"})


def package(revision, output):
    if not re.fullmatch(r"[a-f0-9]{40}", revision) or not os.path.isabs(output):
        raise ValueError("full reviewed revision and absolute artifact path required")
    if subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() != revision:
        raise ValueError("checkout differs from the approved revision")
    # Exclusive output creation prevents overwriting an unrelated archive.
    with open(output, "xb") as destination:
        process = subprocess.Popen(["git", "archive", "--format=tar", revision, "--", *PATHS], stdout=subprocess.PIPE)
        try:
            with tarfile.open(fileobj=process.stdout, mode="r|") as committed, tarfile.open(fileobj=destination, mode="w:gz") as packed:
                for member in committed:
                    if source_member(member.name):
                        packed.addfile(member, committed.extractfile(member) if member.isfile() else None)
            if process.wait() != 0:
                raise ValueError("committed archive could not be produced")
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
            process.wait()


if __name__ == "__main__":
    try:
        package(sys.argv[1], sys.argv[2])
    except (IndexError, ValueError, OSError, subprocess.SubprocessError, tarfile.TarError):
        sys.exit("BLOCKED: approved-revision packaging failed")
