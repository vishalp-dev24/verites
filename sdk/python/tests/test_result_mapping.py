import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from researchplatform import ResearchClient


class ResearchClientResultMappingTest(unittest.TestCase):
    def test_failed_job_error_and_completed_at_are_mapped(self):
        client = ResearchClient(api_key="vts_test", base_url="https://api.example.test/v1")

        result = client._to_result({
            "job_id": "res_failed",
            "session_id": "session-1",
            "mode": "medium",
            "status": "failed",
            "data": {},
            "error": "Formatter failed schema validation",
            "created_at": "2026-05-11T10:00:00.000Z",
            "completed_at": "2026-05-11T10:00:05.000Z",
        })

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error, "Formatter failed schema validation")
        self.assertEqual(result.completed_at, "2026-05-11T10:00:05.000Z")


if __name__ == "__main__":
    unittest.main()
