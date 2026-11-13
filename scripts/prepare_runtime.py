"""CI-only: package official, SHA-256-pinned CPU-only llama.cpp binaries.

Runtime archives are never downloaded or executed from within the application.
Users install the resulting LocalForge package and download only the GGUF model.
"""
import hashlib
import io
import os
import pathlib
import platform
import shutil
import tarfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'src-tauri' / 'runtime'
VERSION = 'b12248'
ARCHIVES = {
    'Windows': (
        f'llama-{VERSION}-bin-win-cpu-x64.zip',
        'bb306bfd390f8782c0acaba490505d12f07392791b48f1dd039387a5bacf1181',
    ),
    'Linux': (
        f'llama-{VERSION}-bin-ubuntu-x64.tar.gz',
        '6b3a530b44f6b0a4ae4872d3b3c8d1edc2ac6bba7d8bd211329a4ba644c0dc65',
    ),
}

def include(name):
    base = pathlib.PurePosixPath(name.replace('\\', '/')).name
    lower = base.lower()
    if lower in ('llama-server', 'llama-server.exe'):
        return True
    return lower.endswith('.dll') or '.so' in lower and (lower.startswith('lib') or lower.startswith('ggml'))

def write_blob(name, data):
    base = pathlib.PurePosixPath(name.replace('\\', '/')).name
    if not base or base in ('.', '..') or not include(name):
        return
    path = DEST / base
    if path.exists():
        raise RuntimeError(f'duplicate runtime entry: {base}')
    path.write_bytes(data)
    if base == 'llama-server':
        path.chmod(0o755)


def main():
    system = platform.system()
    if system not in ARCHIVES:
        raise SystemExit(f'Unsupported packager platform: {system}')
    archive_name, digest = ARCHIVES[system]
    url = f'https://github.com/ggml-org/llama.cpp/releases/download/{VERSION}/{archive_name}'
    print(f'Downloading pinned CPU inference runtime: {archive_name}')
    request = urllib.request.Request(url, headers={'User-Agent': 'LocalForge-CI/0.2'})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != digest:
        raise RuntimeError(f'llama.cpp archive SHA256 mismatch: expected {digest}; got {actual}')
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
    if archive_name.endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            for member in archive.infolist():
                if not member.is_dir() and include(member.filename):
                    write_blob(member.filename, archive.read(member))
    else:
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
            for member in archive:
                if member.isfile() and include(member.name):
                    write_blob(member.name, archive.extractfile(member).read())
    exe = DEST / ('llama-server.exe' if system == 'Windows' else 'llama-server')
    if not exe.exists():
        raise RuntimeError('Expected llama-server binary missing in verified archive')
    print('Prepared runtime:', ', '.join(p.name for p in DEST.iterdir()))

if __name__ == '__main__':
    main()
