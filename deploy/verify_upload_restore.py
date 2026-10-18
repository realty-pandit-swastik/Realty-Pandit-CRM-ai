"""Verify restored upload contents without requiring the deploy user to chown files."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile


def digest(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        result.update(chunk)
    return result.hexdigest()


def verify(archive, restored):
    root = Path(restored).resolve(strict=True)
    hashes = {}
    files = total = 0
    with tarfile.open(archive, 'r|gz') as source:
        for member in source:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0] != 'uploads':
                raise ValueError('Unsafe archive path')
            actual = root.joinpath(*name.parts)
            actual.resolve(strict=True).relative_to(root)
            mode = actual.lstat().st_mode
            if member.isdir():
                if not stat.S_ISDIR(mode):
                    raise ValueError('Directory missing from restore')
            elif member.issym():
                if not stat.S_ISLNK(mode) or os.readlink(actual) != member.linkname:
                    raise ValueError('Restored symbolic link differs')
            elif member.isfile() or member.islnk():
                if not stat.S_ISREG(mode):
                    raise ValueError('File missing from restore')
                if member.islnk():
                    expected = hashes.get(member.linkname)
                    if expected is None:
                        raise ValueError('Hard link target is not verified')
                else:
                    if actual.stat().st_size != member.size:
                        raise ValueError('Restored size differs')
                    with source.extractfile(member) as stream:
                        expected = digest(stream)
                with actual.open('rb') as stream:
                    if digest(stream) != expected:
                        raise ValueError('Restored contents differ')
                hashes[member.name] = expected
                files += 1
                total += actual.stat().st_size
            else:
                raise ValueError('Unsupported archive entry')
    return {'files': files, 'bytes': total, 'verification': 'paths, types, sizes and SHA-256 contents'}


if __name__ == '__main__':
    try:
        print(json.dumps(verify(sys.argv[1], sys.argv[2])))
    except Exception as error:
        # Never put private upload filenames or file contents in deployment logs.
        print('Upload restore verification failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
