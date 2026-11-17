"""Offline regression checks for opt-in model benchmarking; no model download."""
from pathlib import Path
import unittest
import model_smoke as smoke


class TestModelBenchmark(unittest.TestCase):
    def test_urls_and_bounds_match_native_allowlist(self):
        rust = (Path(__file__).resolve().parent.parent / "src-tauri/src/model_catalog.rs").read_text()
        self.assertEqual(len(smoke.MODEL_SPECS), 3)
        for model_id, (_, url, lower, upper) in smoke.MODEL_SPECS.items():
            with self.subTest(model=model_id):
                self.assertIn(model_id, rust)
                self.assertIn(url, rust)
                self.assertTrue(url.startswith("https://huggingface.co/"))
                self.assertLess(lower, upper)

    def test_missing_rss_is_not_fabricated(self):
        self.assertIsNone(smoke.rss_kib(-1))

    def test_runner_metadata(self):
        details = smoke.runner_details()
        self.assertIn("cpu", details)
        self.assertIn("ram_total_kib", details)

    def test_html_completeness_does_not_accept_empty_document(self):
        self.assertFalse(smoke.is_complete_html("<html><body>Hello</body></html>"))
        self.assertTrue(smoke.is_complete_html("<html><style></style><script></script></html>"))


if __name__ == "__main__":
    unittest.main()
