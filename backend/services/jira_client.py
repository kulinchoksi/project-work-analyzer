import requests
import sys
import re
from backend.services.categorizer import Categorizer

class JiraClient:
    def __init__(self, username, password, base_url="https://jira.brodos.net"):
        self.base_url = base_url
        self.username = username
        self.password = password
        self.auth = (username, password)
        self.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        self.categorizer = Categorizer()

    def test_connection(self):
        myself_url = f"{self.base_url}/rest/api/2/myself"
        try:
            resp = requests.get(myself_url, headers=self.headers, auth=self.auth, timeout=10)
            return resp.status_code == 200
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False

    def fetch_issues_with_worklogs(self, start_date, end_date):
        jql = f'worklogAuthor = "{self.username}" AND worklogDate >= "{start_date}" AND worklogDate <= "{end_date}"'
        search_url = f"{self.base_url}/rest/api/2/search"
        
        issues = []
        start_at = 0
        max_results = 50
        
        while True:
            query = {
                "jql": jql,
                "fields": ["summary", "parent", "customfield_11082", "issuetype"],
                "startAt": start_at,
                "maxResults": max_results
            }
            resp = requests.get(search_url, headers=self.headers, auth=self.auth, params=query, timeout=15)
            if resp.status_code != 200:
                raise Exception(f"Jira API Search Error ({resp.status_code}): {resp.text}")
            
            data = resp.json()
            issues.extend(data.get("issues", []))
            
            if start_at + max_results >= data.get("total", 0):
                break
            start_at += max_results
            
        return issues

    def get_epic_link(self, fields, resolved_cache):
        epic_link = fields.get("customfield_11082")
        if epic_link:
            return epic_link
        
        parent = fields.get("parent")
        if parent:
            parent_key = parent.get("key")
            if parent_key in resolved_cache:
                return resolved_cache[parent_key]
                
            parent_url = f"{self.base_url}/rest/api/2/issue/{parent_key}"
            try:
                parent_resp = requests.get(parent_url, headers=self.headers, auth=self.auth, params={"fields": "customfield_11082,issuetype"}, timeout=10)
                if parent_resp.status_code == 200:
                    parent_fields = parent_resp.json().get("fields", {})
                    if parent_fields.get("issuetype", {}).get("name") == "Epic":
                        resolved_cache[parent_key] = parent_key
                        return parent_key
                    parent_epic = parent_fields.get("customfield_11082")
                    if parent_epic:
                        resolved_cache[parent_key] = parent_epic
                        return parent_epic
            except Exception as e:
                print(f"Error fetching parent {parent_key}: {e}")
        return None

    def get_epic_summary(self, epic_key, epic_cache):
        if not epic_key or epic_key == "No Epic":
            return "No Epic"
        if epic_key in epic_cache:
            return epic_cache[epic_key]
        
        epic_url = f"{self.base_url}/rest/api/2/issue/{epic_key}"
        try:
            resp = requests.get(epic_url, headers=self.headers, auth=self.auth, params={"fields": "summary"}, timeout=10)
            if resp.status_code == 200:
                summary = resp.json().get("fields", {}).get("summary", "Unknown Epic Summary")
                epic_cache[epic_key] = summary
                return summary
        except Exception as e:
            print(f"Error fetching epic {epic_key}: {e}")
        return "Unknown Epic Summary"

    def format_time(self, seconds):
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"

    def fetch_all_worklogs_for_issue(self, issue_key):
        """Fetch all worklogs for a single issue, handling pagination."""
        worklog_url = f"{self.base_url}/rest/api/2/issue/{issue_key}/worklog"
        all_worklogs = []
        start_at = 0
        max_results = 1000
        while True:
            try:
                resp = requests.get(
                    worklog_url,
                    headers=self.headers,
                    auth=self.auth,
                    params={"startAt": start_at, "maxResults": max_results},
                    timeout=15,
                )
                if resp.status_code != 200:
                    break
                data = resp.json()
                worklogs = data.get("worklogs", [])
                all_worklogs.extend(worklogs)
                total = data.get("total", 0)
                if start_at + max_results >= total:
                    break
                start_at += max_results
            except Exception as e:
                print(f"Error fetching worklogs for {issue_key}: {e}")
                break
        return all_worklogs

    def _clean_custom_field_value(self, raw_val):
        """Extract clean string representation from Jira custom field payload."""
        if raw_val is None:
            return "N/A"
        if isinstance(raw_val, dict):
            val = raw_val.get("value") or raw_val.get("name") or raw_val.get("key") or raw_val.get("id")
            if val:
                return str(val).strip()
            return str(raw_val).strip()
        elif isinstance(raw_val, list):
            items = [self._clean_custom_field_value(item) for item in raw_val]
            items = [i for i in items if i and i != "N/A"]
            return ", ".join(items) if items else "N/A"
        else:
            s_val = str(raw_val).strip()
            return s_val if s_val else "N/A"

    def _extract_project_key(self, raw_val):
        """Extract project key (e.g. PROJEKTNO-3416) from complex JSON payload or string."""
        if raw_val is None:
            return "N/A"
        if isinstance(raw_val, dict):
            key = raw_val.get("key") or raw_val.get("value") or raw_val.get("name")
            if key:
                key_str = str(key).strip()
                match = re.search(r'([A-Z0-9_]+-\d+)', key_str)
                if match:
                    return match.group(1)
                return key_str
        if isinstance(raw_val, list):
            for item in raw_val:
                extracted = self._extract_project_key(item)
                if extracted and extracted != "N/A":
                    return extracted
        s_val = str(raw_val).strip()
        if not s_val:
            return "N/A"
        match = re.search(r'([A-Z0-9_]+-\d+)', s_val)
        if match:
            return match.group(1)
        if not s_val.startswith("{") and not s_val.startswith("["):
            return s_val
        return "N/A"

    def run_heuristic_categorization(self, summary):
        """Mutually exclusive priority-based categorization for Epic child issues.
        Each issue is assigned to exactly one category. The order of categories
        defines priority — first match wins."""
        cleaned = summary.lower() if summary else ""
        
        categories = {
            "Technical Spike / Setup (Keycloak & Repos)": ["spike", "setup", "keycloak", "repo", "install", "configure", "environment", "scaffold", "repository"],
            "Architecture Reviews & Analysis": ["architecture", "analysis", "diagram", "schema", "prototype", "requirement", "rfd", "rfr"],
            "Refinement & Planning": ["refinement", "planning", "groom", "estimate", "scrum", "budget", "backlog", "cost", "monitoring"],
            "Collaborations & Reviews": ["sync", "collab", "review", "retro", "discuss", "meeting", "jourfix", "collaboration"],
            "GenAI Tooling": ["ai", "tabnine", "antigravity", "crewai", "copilot", "genai", "chatgpt", "gpt", "openai", "llm"]
        }
        
        for category, keywords in categories.items():
            for kw in keywords:
                if re.search(r'\b' + re.escape(kw), cleaned):
                    return category
                    
        return "Pure Implementation / Coding"

    def analyze_worklogs(self, start_date, end_date):
        if not self.test_connection():
            raise Exception("Authentication failed. Please verify your Jira username and API Token.")
            
        issues = self.fetch_issues_with_worklogs(start_date, end_date)
        
        resolved_parent_epics = {}
        epic_cache = {}
        issue_details = {}
        
        for issue in issues:
            key = issue["key"]
            fields = issue["fields"]
            summary = fields.get("summary")
            epic_key = self.get_epic_link(fields, resolved_parent_epics)
            
            issue_details[key] = {
                "summary": summary,
                "epic_key": epic_key or "No Epic",
                "epic_summary": self.get_epic_summary(epic_key, epic_cache),
                "url": f"{self.base_url}/browse/{key}"
            }

        total_seconds = 0
        issue_seconds = {}
        category_seconds = {}
        detailed_worklogs = []

        for key in issue_details.keys():
            worklog_url = f"{self.base_url}/rest/api/2/issue/{key}/worklog"
            try:
                resp = requests.get(worklog_url, headers=self.headers, auth=self.auth, timeout=10)
                if resp.status_code != 200:
                    continue
                
                worklogs = resp.json().get("worklogs", [])
                issue_sec = 0
                for wl in worklogs:
                    author_name = wl.get("author", {}).get("name")
                    started = wl.get("started", "")
                    if author_name == self.username and start_date <= started[:10] <= end_date:
                        time_spent_sec = wl.get("timeSpentSeconds", 0)
                        comment = wl.get("comment", "")
                        
                        cat = self.categorizer.categorize(comment)
                        category_seconds[cat] = category_seconds.get(cat, 0) + time_spent_sec
                        
                        issue_sec += time_spent_sec
                        
                        detailed_worklogs.append({
                            "issueKey": key,
                            "issueSummary": issue_details[key]["summary"],
                            "epicKey": issue_details[key]["epic_key"],
                            "epicSummary": issue_details[key]["epic_summary"],
                            "comment": comment,
                            "started": started[:16].replace('T', ' '),
                            "timeSpentStr": self.format_time(time_spent_sec)
                        })
                
                if issue_sec > 0:
                    issue_seconds[key] = issue_sec
                    total_seconds += issue_sec
            except Exception as e:
                print(f"Error fetching worklogs for {key}: {e}")

        if total_seconds == 0:
            return {
                "totalSeconds": 0,
                "total_str": "0m",
                "epicData": [],
                "issueData": [],
                "categoryData": [],
                "detailedWorklogs": []
            }

        epic_seconds = {}
        for key, sec in issue_seconds.items():
            epic_key = issue_details[key]["epic_key"]
            epic_seconds[epic_key] = epic_seconds.get(epic_key, 0) + sec

        epic_data = []
        for epic_key, sec in sorted(epic_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100
            epic_summary = epic_cache.get(epic_key, "No Epic" if epic_key == "No Epic" else "Unknown Epic")
            epic_data.append({
                "key": epic_key,
                "summary": epic_summary,
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2),
                "url": f"{self.base_url}/browse/{epic_key}" if epic_key != "No Epic" else "#"
            })

        issue_data = []
        for key, sec in sorted(issue_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100
            details = issue_details[key]
            issue_data.append({
                "key": key,
                "summary": details["summary"],
                "epic_key": details["epic_key"],
                "epic_summary": details["epic_summary"],
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2),
                "url": details["url"]
            })

        category_data = []
        for cat, sec in sorted(category_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100
            category_data.append({
                "category": cat,
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2)
            })

        return {
            "totalSeconds": total_seconds,
            "total_str": self.format_time(total_seconds),
            "epicData": epic_data,
            "issueData": issue_data,
            "categoryData": category_data,
            "detailedWorklogs": detailed_worklogs
        }

    def analyze_epic_worklogs(self, epic_key):
        if not self.test_connection():
            raise Exception("Authentication failed. Please verify your Jira username and API Token.")
            
        cost_unit_field = "customfield_10084"
        global_project_field = "customfield_19582"
        
        # 1. Fetch Epic Details
        epic_url = f"{self.base_url}/rest/api/2/issue/{epic_key}"
        fields_to_query = f"summary,status,priority,duedate,created,updated,labels,{cost_unit_field},{global_project_field}"
            
        epic_resp = requests.get(epic_url, headers=self.headers, auth=self.auth, params={"fields": fields_to_query}, timeout=10)
        if epic_resp.status_code != 200:
            raise Exception(f"Failed to fetch Epic details for {epic_key}: {epic_resp.text}")
            
        epic_data = epic_resp.json()
        epic_fields = epic_data.get("fields", {})
        
        brodos_num = self._extract_project_key(epic_fields.get(global_project_field)) if global_project_field else "N/A"
        brodos_url = f"{self.base_url}/browse/{brodos_num}" if (brodos_num and brodos_num != "N/A" and "-" in brodos_num) else None
        cost_unit_val = self._clean_custom_field_value(epic_fields.get(cost_unit_field)) if cost_unit_field else "N/A"

        metadata = {
            "key": epic_key,
            "title": epic_fields.get("summary", "Unknown Epic"),
            "status": epic_fields.get("status", {}).get("name", "N/A"),
            "priority": epic_fields.get("priority", {}).get("name", "N/A"),
            "dueDate": epic_fields.get("duedate") or "N/A",
            "created": (epic_fields.get("created") or "N/A")[:10],
            "updated": (epic_fields.get("updated") or "N/A")[:10],
            "labels": epic_fields.get("labels", []),
            "costUnitNumber": cost_unit_val,
            "brodosProjectNumber": brodos_num,
            "url": f"{self.base_url}/browse/{epic_key}",
            "brodosProjectUrl": brodos_url
        }

        # 2. Fetch Direct Child Issues of the Epic
        jql_children = f'"Epic Link" = {epic_key} OR parent = {epic_key}'
        search_url = f"{self.base_url}/rest/api/2/search"
        
        child_issues = []
        start_at = 0
        max_results = 50
        while True:
            query = {
                "jql": jql_children,
                "fields": ["summary", "parent", "issuetype"],
                "startAt": start_at,
                "maxResults": max_results
            }
            resp = requests.get(search_url, headers=self.headers, auth=self.auth, params=query, timeout=15)
            if resp.status_code != 200:
                raise Exception(f"Failed searching child issues: {resp.text}")
            data = resp.json()
            child_issues.extend(data.get("issues", []))
            if start_at + max_results >= data.get("total", 0):
                break
            start_at += max_results

        # 3. Retrieve all Subtasks recursively
        child_keys = [issue["key"] for issue in child_issues]
        subtasks = []
        if child_keys:
            jql_subtasks = f"parent in ({','.join(child_keys)})"
            start_at = 0
            while True:
                query = {
                    "jql": jql_subtasks,
                    "fields": ["summary", "parent", "issuetype"],
                    "startAt": start_at,
                    "maxResults": max_results
                }
                resp = requests.get(search_url, headers=self.headers, auth=self.auth, params=query, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    subtasks.extend(data.get("issues", []))
                    if start_at + max_results >= data.get("total", 0):
                        break
                    start_at += max_results
                else:
                    break

        # Map subtasks back to parent key and prepopulate parents
        all_issue_keys = [epic_key] + child_keys + [st["key"] for st in subtasks]
        parent_map = {} # subtask_key -> parent_key
        for st in subtasks:
            parent_key = st.get("fields", {}).get("parent", {}).get("key")
            if parent_key:
                parent_map[st["key"]] = parent_key

        issue_info = {} # key -> {summary, category}
        issue_info[epic_key] = {"summary": metadata["title"], "category": "Collaboration"}
        
        # Categorize parent issues
        for child in child_issues:
            key = child["key"]
            summary = child.get("fields", {}).get("summary", "")
            cat = self.run_heuristic_categorization(summary)
            issue_info[key] = {"summary": summary, "category": cat}

        # Subtasks inherit parent's categorization
        for st in subtasks:
            key = st["key"]
            summary = st.get("fields", {}).get("summary", "")
            parent_key = parent_map.get(key)
            cat = issue_info.get(parent_key, {}).get("category", "Pure Implementation / Coding")
            issue_info[key] = {"summary": summary, "category": cat}

        # 4. Fetch All Worklogs (paginated)
        total_seconds = 0
        aggregated_issue_seconds = {} # parent_key -> seconds
        user_seconds = {} # user -> seconds
        category_seconds = {} # category -> seconds
        detailed_worklogs = []

        # Iterate through all issues in the project tree
        for key in all_issue_keys:
            worklogs = self.fetch_all_worklogs_for_issue(key)
            for wl in worklogs:
                author_name = wl.get("author", {}).get("displayName") or wl.get("author", {}).get("name", "Unknown")
                time_spent_sec = wl.get("timeSpentSeconds", 0)
                comment = wl.get("comment", "")
                started = wl.get("started", "")
                
                if time_spent_sec > 0:
                    total_seconds += time_spent_sec
                    user_seconds[author_name] = user_seconds.get(author_name, 0) + time_spent_sec
                    
                    # Determine category of this worklog
                    cat = issue_info.get(key, {}).get("category", "Pure Implementation / Coding")
                    category_seconds[cat] = category_seconds.get(cat, 0) + time_spent_sec
                    
                    # Roll up subtask worklogs to parent issues
                    target_key = parent_map.get(key, key)
                    aggregated_issue_seconds[target_key] = aggregated_issue_seconds.get(target_key, 0) + time_spent_sec
                    
                    detailed_worklogs.append({
                        "issueKey": key,
                        "issueSummary": issue_info[key]["summary"],
                        "epicKey": epic_key,
                        "epicSummary": metadata["title"],
                        "comment": comment,
                        "started": started[:16].replace('T', ' '),
                        "timeSpentStr": self.format_time(time_spent_sec),
                        "author": author_name
                    })

        # Compile Output payloads
        category_data = []
        for cat, sec in sorted(category_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100 if total_seconds > 0 else 0
            category_data.append({
                "category": cat,
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2)
            })

        user_data = []
        for user, sec in sorted(user_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100 if total_seconds > 0 else 0
            user_data.append({
                "username": user,
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2)
            })

        issue_data = []
        for key, sec in sorted(aggregated_issue_seconds.items(), key=lambda x: x[1], reverse=True):
            pct = (sec / total_seconds) * 100 if total_seconds > 0 else 0
            summary = issue_info.get(key, {}).get("summary", "Unknown Issue")
            cat = issue_info.get(key, {}).get("category", "Pure Implementation / Coding")
            issue_data.append({
                "key": key,
                "summary": summary,
                "epic_key": epic_key,
                "epic_summary": metadata["title"],
                "seconds": sec,
                "time_str": self.format_time(sec),
                "percentage": round(pct, 2),
                "url": f"{self.base_url}/browse/{key}",
                "category": cat
            })

        return {
            "totalSeconds": total_seconds,
            "total_str": self.format_time(total_seconds),
            "metadata": metadata,
            "categoryData": category_data,
            "userData": user_data,
            "issueData": issue_data,
            "detailedWorklogs": detailed_worklogs
        }
