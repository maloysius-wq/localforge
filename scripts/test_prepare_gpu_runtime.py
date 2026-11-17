"""Offline packaging guard tests; CI never downloads CUDA for these tests."""
import unittest
from pathlib import Path
import prepare_gpu_runtime as cuda


class TestCudaPackaging(unittest.TestCase):
    def test_only_runtime_binaries_are_accepted(self):
        for name in ("bin/llama-server.exe", "lib/ggml-cuda.dll", "cudart64_12.dll"):
            self.assertTrue(cuda.permitted(name), name)
        for name in ("../unexpected.exe", "setup.exe", "autorun.ps1", "malware.bat", "README.md"):
            self.assertFalse(cuda.permitted(name), name)

    def test_release_and_hashes_are_pinned(self):
        self.assertEqual(cuda.RELEASE, "prism-b12128-d7b2896")
        self.assertEqual(len(cuda.ARCHIVES), 2)
        for filename, expected_sha in cuda.ARCHIVES:
            self.assertTrue(filename.endswith(".zip"))
            self.assertEqual(len(expected_sha), 64)
            self.assertTrue(all(ch in "0123456789abcdef" for ch in expected_sha))

    def test_gpu_and_cpu_are_separate_directories(self):
        self.assertEqual(cuda.DEST.name, "runtime-cuda")
        self.assertNotEqual(cuda.DEST.name, "runtime")


if __name__ == "__main__":
    unittest.main()
