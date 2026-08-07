import os
import json
import re

class Categorizer:
    def __init__(self, rules_path=None):
        if rules_path is None:
            # Default to the location relative to this file
            dir_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            rules_path = os.path.join(dir_path, "data", "rules.json")
        
        self.rules_path = rules_path
        self.rules = self.load_rules()

    def load_rules(self):
        try:
            if os.path.exists(self.rules_path):
                with open(self.rules_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            else:
                return {}
        except Exception as e:
            print(f"Error loading rules: {e}")
            return {}

    def save_rules(self, rules):
        try:
            os.makedirs(os.path.dirname(self.rules_path), exist_ok=True)
            with open(self.rules_path, "w", encoding="utf-8") as f:
                json.dump(rules, f, indent=2)
            self.rules = rules
            return True
        except Exception as e:
            print(f"Error saving rules: {e}")
            return False

    def sanitize_text(self, text):
        if not text:
            return ""
        # Lowercase and replace non-alphanumeric (except spaces) with empty space
        text = text.lower()
        text = re.sub(r'[^a-z0-9\s]', ' ', text)
        # Collapse multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def categorize(self, comment):
        sanitized = self.sanitize_text(comment)
        if not sanitized:
            return "Uncategorized"

        # Prioritize matching. We want to find phrases/keywords from longest to shortest.
        # This solves the "setup call" (collaboration) vs "setup" (dev) issue.
        all_candidates = []
        for category, keywords in self.rules.items():
            for kw in keywords:
                kw_sanitized = self.sanitize_text(kw)
                if kw_sanitized:
                    all_candidates.append({
                        "category": category,
                        "phrase": kw_sanitized,
                        "length": len(kw_sanitized.split())
                    })
        
        # Sort candidates by word length (descending) so multi-word phrases match first
        all_candidates.sort(key=lambda x: x["length"], reverse=True)

        for candidate in all_candidates:
            phrase = candidate["phrase"]
            
            # Intelligent suffix boundary matching:
            # If the base phrase ends in 'e' (like code, create, estimate), we drop 'e'
            # and append a custom suffix list that includes the 'e' or its modifications (coded, coding).
            if phrase.endswith('e') and len(phrase) > 2:
                base = phrase[:-1]
                pattern = r'\b' + re.escape(base) + r'(?:e|es|ed|ing|er|ers)?\b'
            else:
                pattern = r'\b' + re.escape(phrase) + r'(?:s|ed|ing|er|ers)?\b'
                
            if re.search(pattern, sanitized):
                return candidate["category"]

        return "Uncategorized"
