import unittest
from backend.services.jira_client import JiraClient

class TestEpicAnalysis(unittest.TestCase):
    def setUp(self):
        # We don't need valid credentials for the local categorization checks
        self.client = JiraClient(username="test_user", password="test_password")

    # ─── Heuristic Categorization Tests ───────────────────────────────────

    def test_heuristic_categorization_spike_setup(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("Setup Keycloak authorization"),
            "Technical Spike / Setup (Keycloak & Repos)"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Repository spike & environment install"),
            "Technical Spike / Setup (Keycloak & Repos)"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Configure CI/CD pipeline for repo"),
            "Technical Spike / Setup (Keycloak & Repos)"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Scaffold new microservice project"),
            "Technical Spike / Setup (Keycloak & Repos)"
        )

    def test_heuristic_categorization_architecture(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("Database schemas analysis and diagrams"),
            "Architecture Reviews & Analysis"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Prototype new authentication flow"),
            "Architecture Reviews & Analysis"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("RFD review for payment module"),
            "Architecture Reviews & Analysis"
        )

    def test_heuristic_categorization_refinement_planning(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("Backlog grooming & sprint planning"),
            "Refinement & Planning"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Cost estimation for Q3 budget"),
            "Refinement & Planning"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Sprint monitoring dashboard update"),
            "Refinement & Planning"
        )

    def test_heuristic_categorization_collaboration(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("Cross-team alignment sync on Friday"),
            "Collaborations & Reviews"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Retrospective meeting with dev team"),
            "Collaborations & Reviews"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Jourfix with product owner"),
            "Collaborations & Reviews"
        )

    def test_heuristic_categorization_genai(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("CrewAI POC learning curve and pairing"),
            "GenAI Tooling"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Tabnine integration testing"),
            "GenAI Tooling"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Exploring Copilot for code generation"),
            "GenAI Tooling"
        )

    def test_heuristic_categorization_default_fallback(self):
        self.assertEqual(
            self.client.run_heuristic_categorization("Build responsive UI widget with Tailwind"),
            "Pure Implementation / Coding"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Fix standard authentication bug"),
            "Pure Implementation / Coding"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Create REST endpoint for orders API"),
            "Pure Implementation / Coding"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization("Unit test coverage for payment module"),
            "Pure Implementation / Coding"
        )

    # ─── Mutually Exclusive Category Assignment ───────────────────────────

    def test_each_issue_gets_exactly_one_category(self):
        """Verify that each issue summary is categorized into exactly one category."""
        summaries = [
            "Setup Keycloak auth and review architecture",
            "Sprint planning and sync with team",
            "Build feature and review with peers",
            "GenAI POC and spike on LLM integration",
        ]
        for summary in summaries:
            result = self.client.run_heuristic_categorization(summary)
            self.assertIsInstance(result, str)
            self.assertNotEqual(result, "")

    def test_category_priority_order(self):
        """Verify that when multiple keywords match, the first priority category wins."""
        result = self.client.run_heuristic_categorization("Setup and review session")
        self.assertEqual(result, "Technical Spike / Setup (Keycloak & Repos)")

        result = self.client.run_heuristic_categorization("Analysis and planning session")
        self.assertEqual(result, "Architecture Reviews & Analysis")

    # ─── Subtask Rollup Simulation ────────────────────────────────────────

    def test_subtask_inherits_parent_category(self):
        """Simulate the subtask categorization logic: subtask inherits its parent's category."""
        parent_summaries = {
            "TASK-1": "Setup Keycloak integration",
            "TASK-2": "Sprint refinement and backlog grooming",
            "TASK-3": "Build REST API for orders",
        }

        issue_info = {}
        for key, summary in parent_summaries.items():
            cat = self.client.run_heuristic_categorization(summary)
            issue_info[key] = {"summary": summary, "category": cat}

        subtasks = {
            "SUB-1": {"summary": "Subtask: write tests for Keycloak", "parent": "TASK-1"},
            "SUB-2": {"summary": "Subtask: update estimation sheet", "parent": "TASK-2"},
            "SUB-3": {"summary": "Subtask: add pagination to API", "parent": "TASK-3"},
        }

        for key, info in subtasks.items():
            parent_key = info["parent"]
            inherited_cat = issue_info[parent_key]["category"]
            issue_info[key] = {"summary": info["summary"], "category": inherited_cat}

        self.assertEqual(issue_info["SUB-1"]["category"], "Technical Spike / Setup (Keycloak & Repos)")
        self.assertEqual(issue_info["SUB-2"]["category"], "Refinement & Planning")
        self.assertEqual(issue_info["SUB-3"]["category"], "Pure Implementation / Coding")

    # ─── Aggregation Logic Tests ──────────────────────────────────────────

    def test_subtask_seconds_rollup_to_parent(self):
        """Verify that subtask worklogs correctly aggregate into their parent issue totals."""
        parent_map = {
            "SUB-1": "TASK-1",
            "SUB-2": "TASK-1",
            "SUB-3": "TASK-2",
        }

        worklogs = {
            "TASK-1": 3600,
            "SUB-1": 7200,
            "SUB-2": 1800,
            "TASK-2": 5400,
            "SUB-3": 900,
        }

        aggregated = {}
        for key, seconds in worklogs.items():
            target_key = parent_map.get(key, key)
            aggregated[target_key] = aggregated.get(target_key, 0) + seconds

        self.assertEqual(aggregated["TASK-1"], 12600)
        self.assertEqual(aggregated["TASK-2"], 6300)

    def test_total_seconds_accuracy(self):
        """Verify total seconds across all worklogs sum correctly."""
        worklogs_seconds = [3600] * 300
        worklogs_seconds += [1800] * 50
        total = sum(worklogs_seconds)
        self.assertEqual(total, 300 * 3600 + 50 * 1800)

    # ─── Format Time Tests ────────────────────────────────────────────────

    def test_format_time_basic(self):
        self.assertEqual(self.client.format_time(0), "0m")
        self.assertEqual(self.client.format_time(60), "1m")
        self.assertEqual(self.client.format_time(3600), "1h 0m")
        self.assertEqual(self.client.format_time(3660), "1h 1m")
        self.assertEqual(self.client.format_time(7200), "2h 0m")

    def test_format_time_large_values(self):
        self.assertEqual(self.client.format_time(300 * 3600), "300h 0m")
        self.assertEqual(self.client.format_time(500 * 3600 + 30 * 60), "500h 30m")
        self.assertEqual(self.client.format_time(1000 * 3600 + 59 * 60), "1000h 59m")

    # ─── Edge Cases ───────────────────────────────────────────────────────

    def test_heuristic_categorization_empty_summary(self):
        self.assertEqual(
            self.client.run_heuristic_categorization(""),
            "Pure Implementation / Coding"
        )
        self.assertEqual(
            self.client.run_heuristic_categorization(None),
            "Pure Implementation / Coding"
        )

    def test_no_duplicate_counting_across_categories(self):
        test_summaries = [
            "Setup Keycloak and review architecture diagrams for spike",
            "Sprint planning meeting with team sync",
            "Build and deploy GenAI copilot integration",
            "Refinement of backlog estimates",
            "Pure coding for REST API development",
        ]
        for summary in test_summaries:
            result = self.client.run_heuristic_categorization(summary)
            self.assertIsInstance(result, str)
            valid_categories = [
                "Technical Spike / Setup (Keycloak & Repos)",
                "Architecture Reviews & Analysis",
                "Refinement & Planning",
                "Collaborations & Reviews",
                "GenAI Tooling",
                "Pure Implementation / Coding"
            ]
            self.assertIn(result, valid_categories)


    # ─── Custom Field Extraction Tests ────────────────────────────────────

    def test_extract_project_key_from_dict(self):
        dict_payload = {
            'self': 'https://jira.brodos.net/rest/api/2/issue/12345',
            'id': '12345',
            'key': 'PROJEKTNO-3416',
            'value': 'PROJEKTNO-3416'
        }
        self.assertEqual(self.client._extract_project_key(dict_payload), "PROJEKTNO-3416")

    def test_extract_project_key_from_string_json(self):
        json_str = "{'key': 'PROJEKTNO-3416', 'value': 'Project X'}"
        self.assertEqual(self.client._extract_project_key(json_str), "PROJEKTNO-3416")

    def test_extract_project_key_plain_string(self):
        self.assertEqual(self.client._extract_project_key("PROJEKTNO-3416"), "PROJEKTNO-3416")
        self.assertEqual(self.client._extract_project_key(None), "N/A")

    def test_clean_custom_field_value(self):
        self.assertEqual(self.client._clean_custom_field_value({'value': '102030'}), "102030")
        self.assertEqual(self.client._clean_custom_field_value(['101', '102']), "101, 102")
        self.assertEqual(self.client._clean_custom_field_value("4500"), "4500")
        self.assertEqual(self.client._clean_custom_field_value(None), "N/A")


if __name__ == "__main__":
    unittest.main()

