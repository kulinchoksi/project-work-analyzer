import os
import json
import tempfile
import unittest
from backend.services.categorizer import Categorizer

class TestCategorizer(unittest.TestCase):
    def setUp(self):
        # Create a temporary rules file and close it immediately so Windows doesn't lock it
        self.temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".json")
        self.rules_data = {
            "Collaboration": ["sync", "meeting", "comm", "call", "setup call", "setup meeting"],
            "Execution & Dev": ["code", "develop", "implement", "setup"]
        }
        try:
            self.temp_file.write(json.dumps(self.rules_data).encode('utf-8'))
        finally:
            self.temp_file.close()
        
        self.categorizer = Categorizer(rules_path=self.temp_file.name)

    def tearDown(self):
        try:
            os.unlink(self.temp_file.name)
        except Exception as e:
            print(f"Error unlinking temp file: {e}")

    def test_single_word_matching(self):
        # Test basic matches and stem matching (e.g. \bcode matching coded)
        self.assertEqual(self.categorizer.categorize("coded some features"), "Execution & Dev")
        self.assertEqual(self.categorizer.categorize("daily sync meeting"), "Collaboration")
        
    def test_ngram_priority_matching(self):
        # "setup" by itself should match "Execution & Dev"
        self.assertEqual(self.categorizer.categorize("server setup"), "Execution & Dev")
        
        # "setup call" should prioritize the longer "setup call" phrase and match "Collaboration"
        self.assertEqual(self.categorizer.categorize("setup call with client"), "Collaboration")
        self.assertEqual(self.categorizer.categorize("setup meeting with team"), "Collaboration")

    def test_case_insensitive_and_sanitization(self):
        self.assertEqual(self.categorizer.categorize("CoDeD some features"), "Execution & Dev")
        self.assertEqual(self.categorizer.categorize("sync!!! with developers"), "Collaboration")

    def test_uncategorized(self):
        self.assertEqual(self.categorizer.categorize("unrelated comment text here"), "Uncategorized")

if __name__ == "__main__":
    unittest.main()
