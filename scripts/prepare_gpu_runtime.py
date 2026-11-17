"""Stage SHA-pinned PrismML CUDA 12.4 binaries at package-build time.

The installed LocalForge app never downloads executables. This standalone
runtime has no shared library paths with the CPU runtime.
"""
import hashlib
import io
import pathlib
import platform
import urllib.request
import zipfile

DEST = pathlib.Path(__file__).resolve().parents[1] / "src-tauri" / "runtime-cuda"
RELEASE = "prism-b12128-d7b2896"
ARCHIVES = [
    ("llama-prism-b12128-d7b2896-bin-win-cuda-12.4-x64.zip",
     "14969ae6831abfc836295e8f4b8e09e686a063b559a8c974412001d9f5ce4f7f"),
    ("cudart-llama-bin-win-cuda-12.4-x64.zip",
     "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6"),
]


def permitted(name):
    base = pathlib.PurePosixPath(name.replace("\\", "/")).name.lower()
    return base == "llama-server.exe" or base.endswith(".dll")


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    if platform.system() != "Windows":
        (DEST / "README.txt").write_text("CUDA backend is currently packaged on Windows x64 only.\n")
        return
    for archive_name, expected in ARCHIVES:
        url = f"https://github.com/PrismML-Eng/llama.cpp/releases/download/{RELEASE}/{archive_name}"
        req = urllib.request.Request(url, headers={"User-Agent": "LocalForge-CI/0.3.12"})
        with urllib.request.urlopen(req, timeout=300) as response:
            payload = response.read()
        actual = hashlib.sha256(payload).hexdigest()
        if actual != expected:
            raise RuntimeError(f"CUDA runtime SHA-256 mismatch for {archive_name}: {actual}")
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            for member in archive.infolist():
                if member.is_dir() or not permitted(member.filename):
                    continue
                if member.file_size > 2_500_000_000:
                    raise RuntimeError(f"Unexpectedly large CUDA runtime file: {member.filename} ({member.file_size} bytes)")
                base = pathlib.PurePosixPath(member.filename.replace("\\", "/")).name
                dest = DEST / base
                content = archive.read(member)
                if dest.exists():
                    if hashlib.sha256(dest.read_bytes()).digest() != hashlib.sha256(content).digest():
                        raise RuntimeError("Conflicting CUDA binary: " + base)
                else:
                    dest.write_bytes(content)
    if not (DEST / "llama-server.exe").is_file():
        raise RuntimeError("No llama-server.exe in verified CUDA archive")
    if not any(entry.name.lower().startswith("cudart64") for entry in DEST.iterdir()):
        raise RuntimeError("CUDA 12.4 runtime DLL is missing")
    (DEST / "PROVENANCE.txt").write_text(
        f"PrismML llama.cpp {RELEASE} - CUDA 12.4 experimental\n"
        + "\n".join(f"{name}: sha256:{digest}" for name, digest in ARCHIVES)
        + "\nGTX 1060 Pascal support must still be verified on actual hardware.\n"
    )
    print("Verified CUDA runtime staged:", len(list(DEST.iterdir())), "files")


if __name__ == "__main__":
    main()
