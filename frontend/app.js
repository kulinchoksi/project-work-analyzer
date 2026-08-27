// In-memory credentials to protect security
let jiraCredentials = {
    username: "",
    password: ""
};

let epicChartInstance = null;
let categoryChartInstance = null;
let userAnalysisData = null; // Preserves User Work Analysis report during session
let projectAnalysisData = null; // Preserves Project Analysis report during session
let currentAnalysisData = null; // Stored to allow direct CSV downloading of fetched dataset
let currentMode = 'user'; // 'user' or 'project'

// Chart.js color palettes
const CHART_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#84cc16', '#64748b'];
const CATEGORY_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#ec4899', '#14b8a6'];

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
    // Set default dates: default end date is today, start date is today as well
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("start-date").value = today;
    document.getElementById("end-date").value = today;

    // Load categorization rules from backend
    loadRules();
    
    // Setup searchable user dropdown
    setupUserSearch();
});

let userSearchTimeout = null;

function setupUserSearch() {
    const searchInput = document.getElementById("target-user-search");
    const dropdown = document.getElementById("user-search-dropdown");
    const targetUsernameInput = document.getElementById("target-username");

    if (!searchInput || !dropdown || !targetUsernameInput) return;

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (userSearchTimeout) clearTimeout(userSearchTimeout);

        if (!query) {
            dropdown.innerHTML = "";
            dropdown.classList.add("hidden");
            targetUsernameInput.value = "";
            return;
        }

        userSearchTimeout = setTimeout(() => {
            fetch(`/api/users/search?query=${encodeURIComponent(query)}&username=${encodeURIComponent(jiraCredentials.username)}&password=${encodeURIComponent(jiraCredentials.password)}`)
            .then(resp => {
                if (!resp.ok) throw new Error("Search failed");
                return resp.json();
            })
            .then(users => {
                dropdown.innerHTML = "";
                if (users && users.length > 0) {
                    dropdown.classList.remove("hidden");
                    users.forEach(user => {
                        const div = document.createElement("div");
                        div.className = "px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0 text-slate-700";
                        div.textContent = `${user.displayName || user.name} (${user.name})`;
                        div.addEventListener("click", () => {
                            searchInput.value = user.displayName || user.name;
                            targetUsernameInput.value = user.name;
                            dropdown.classList.add("hidden");
                        });
                        dropdown.appendChild(div);
                    });
                } else {
                    dropdown.classList.add("hidden");
                }
            })
            .catch(err => {
                console.error("User search error:", err);
            });
        }, 300); // 300ms debounce
    });

    // Close dropdown on clicking outside
    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
        }
    });
}

// ─── View Switching ──────────────────────────────────────────────────────────

function showView(viewId) {
    if (viewId === "auth") {
        document.getElementById("auth-view").classList.remove("hidden");
        document.getElementById("dashboard-view").classList.add("hidden");
        document.getElementById("user-display").classList.add("hidden");
    } else {
        document.getElementById("auth-view").classList.add("hidden");
        document.getElementById("dashboard-view").classList.remove("hidden");
        document.getElementById("user-display").classList.remove("hidden");
        document.getElementById("logged-username").textContent = `Connected: ${jiraCredentials.username}`;
    }
}

// ─── Analysis Mode Switching ─────────────────────────────────────────────────

function switchAnalysisMode(mode) {
    currentMode = mode;
    const tabUser = document.getElementById("tab-user");
    const tabProject = document.getElementById("tab-project");
    const userControls = document.getElementById("user-controls");
    const projectControls = document.getElementById("project-controls");
    const controlsTitle = document.getElementById("controls-title");
    const controlsDesc = document.getElementById("controls-desc");
    const emptyStateDesc = document.getElementById("empty-state-desc");

    if (mode === 'user') {
        tabUser.className = "py-3 px-6 font-bold text-sm border-b-2 border-blue-600 text-blue-600 transition focus:outline-none";
        tabProject.className = "py-3 px-6 font-semibold text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition focus:outline-none";
        userControls.classList.remove("hidden");
        projectControls.classList.add("hidden");
        controlsTitle.textContent = "Analyse Work Allocation";
        controlsDesc.textContent = "Select a date range to process and categorize your worklogs. Maximum allowed range is 1 month.";
        emptyStateDesc.textContent = 'Select the date range above and click "Analyse Allocation" to fetch and aggregate your Jira worklog metrics.';

        if (userAnalysisData) {
            document.getElementById("dashboard-empty").classList.add("hidden");
            currentAnalysisData = userAnalysisData;
            renderUserDashboard(userAnalysisData);
        } else {
            document.getElementById("analysis-panel").classList.add("hidden");
            document.getElementById("epic-metadata-card").classList.add("hidden");
            document.getElementById("executive-learnings-card").classList.add("hidden");
            document.getElementById("dashboard-empty").classList.remove("hidden");
            currentAnalysisData = null;
        }
    } else {
        tabProject.className = "py-3 px-6 font-bold text-sm border-b-2 border-blue-600 text-blue-600 transition focus:outline-none";
        tabUser.className = "py-3 px-6 font-semibold text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition focus:outline-none";
        userControls.classList.add("hidden");
        projectControls.classList.remove("hidden");
        controlsTitle.textContent = "Analyse Project / Epic";
        controlsDesc.textContent = "Enter an Epic Key to analyse effort distribution, team contributions, and category breakdown across the entire project.";
        emptyStateDesc.textContent = 'Enter an Epic Key (e.g. STORESHIP-15121) and click "Analyse Allocation" to begin project-level analysis.';

        if (projectAnalysisData) {
            document.getElementById("dashboard-empty").classList.add("hidden");
            currentAnalysisData = projectAnalysisData;
            renderProjectDashboard(projectAnalysisData);
        } else {
            document.getElementById("analysis-panel").classList.add("hidden");
            document.getElementById("epic-metadata-card").classList.add("hidden");
            document.getElementById("executive-learnings-card").classList.add("hidden");
            document.getElementById("dashboard-empty").classList.remove("hidden");
            currentAnalysisData = null;
        }
    }
}

// ─── Analysis Trigger Dispatcher ─────────────────────────────────────────────

function triggerAnalysis() {
    if (currentMode === 'user') {
        analyzeWorklogs();
    } else {
        analyzeEpicWorklogs();
    }
}

// ─── Authentication ──────────────────────────────────────────────────────────

function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById("username").value.trim();
    const passwordInput = document.getElementById("password").value;

    document.getElementById("auth-error").classList.add("hidden");

    const btn = event.target.querySelector("button[type='submit']");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin mr-2"></i> Verifying...`;
    btn.disabled = true;

    fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: usernameInput,
            password: passwordInput,
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        })
    })
    .then(async resp => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if (resp.ok) {
            jiraCredentials.username = usernameInput;
            jiraCredentials.password = passwordInput;
            document.getElementById("target-user-search").value = usernameInput;
            document.getElementById("target-username").value = usernameInput;
            showView("dashboard");
        } else {
            const err = await resp.json();
            throw new Error(err.detail || "Authentication failed. Check your API token.");
        }
    })
    .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        document.getElementById("auth-error").classList.remove("hidden");
        document.getElementById("auth-error-msg").textContent = err.message;
    });
}

function logout() {
    jiraCredentials.username = "";
    jiraCredentials.password = "";
    userAnalysisData = null;
    projectAnalysisData = null;
    currentAnalysisData = null;
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    showView("auth");
}

// ─── User Work Analysis ──────────────────────────────────────────────────────

function analyzeWorklogs() {
    const start = document.getElementById("start-date").value;
    const end = document.getElementById("end-date").value;
    let targetUser = document.getElementById("target-username").value.trim();
    if (!targetUser) {
        const searchText = document.getElementById("target-user-search").value.trim();
        if (searchText) {
            targetUser = searchText;
        } else {
            targetUser = jiraCredentials.username;
        }
    }

    if (!start || !end) {
        alert("Please select both a start date and an end date.");
        return;
    }

    const sDate = new Date(start);
    const eDate = new Date(end);
    const diffTime = Math.abs(eDate - sDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (eDate < sDate) {
        alert("End Date cannot be earlier than Start Date.");
        return;
    }
    if (diffDays > 31) {
        alert("Maximum allowed range is 1 month (31 days).");
        return;
    }

    showLoader();

    fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: jiraCredentials.username,
            password: jiraCredentials.password,
            startDate: start,
            endDate: end,
            targetUser: targetUser
        })
    })
    .then(async resp => {
        hideLoader();
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || "Error loading allocation analysis.");
        }
        return resp.json();
    })
    .then(data => {
        userAnalysisData = data;
        currentAnalysisData = data;
        renderUserDashboard(data);
    })
    .catch(err => {
        hideLoader();
        document.getElementById("dashboard-empty").classList.remove("hidden");
        alert(err.message);
    });
}

// ─── Epic / Project Analysis ─────────────────────────────────────────────────

function analyzeEpicWorklogs() {
    const epicKey = document.getElementById("epic-key").value.trim();
    if (!epicKey) {
        alert("Please enter an Epic Key (e.g. STORESHIP-15121).");
        return;
    }

    showLoader();

    fetch("/api/analyze/epic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: jiraCredentials.username,
            password: jiraCredentials.password,
            epicKey: epicKey
        })
    })
    .then(async resp => {
        hideLoader();
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || "Error loading Epic analysis.");
        }
        return resp.json();
    })
    .then(data => {
        projectAnalysisData = data;
        currentAnalysisData = data;
        renderProjectDashboard(data);
    })
    .catch(err => {
        hideLoader();
        document.getElementById("dashboard-empty").classList.remove("hidden");
        alert(err.message);
    });
}

// ─── Loader Helpers ──────────────────────────────────────────────────────────

function showLoader() {
    document.getElementById("dashboard-empty").classList.add("hidden");
    document.getElementById("analysis-panel").classList.add("hidden");
    document.getElementById("epic-metadata-card").classList.add("hidden");
    document.getElementById("executive-learnings-card").classList.add("hidden");
    document.getElementById("dashboard-loader").classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("dashboard-loader").classList.add("hidden");
}

// ─── User Mode Dashboard Rendering ──────────────────────────────────────────

function renderUserDashboard(data) {
    if (!data || data.totalSeconds === 0) {
        alert("No worklogs found for your user in this date range.");
        document.getElementById("dashboard-empty").classList.remove("hidden");
        return;
    }

    // Hide project-specific panels
    document.getElementById("epic-metadata-card").classList.add("hidden");
    document.getElementById("executive-learnings-card").classList.add("hidden");

    // Update titles for user mode
    document.getElementById("chart-left-title").textContent = "Time Spent by Epic";
    document.getElementById("chart-right-title").textContent = "Time Spent by Activity Category";
    document.getElementById("table-left-title").textContent = "Epic Distribution";
    document.getElementById("table-detailed-title").textContent = "Detailed Issue Level Breakdown";

    // Update left table header for user mode (Epic table)
    document.getElementById("table-left-head").innerHTML = `
        <tr>
            <th class="px-5 py-3">Epic</th>
            <th class="px-5 py-3">Summary</th>
            <th class="px-5 py-3 text-right">Time Spent</th>
            <th class="px-5 py-3 text-right">Percentage</th>
        </tr>
    `;

    // Update detailed table header for user mode
    document.getElementById("detailed-table-head").innerHTML = `
        <tr>
            <th class="px-5 py-3">Issue Key</th>
            <th class="px-5 py-3">Summary</th>
            <th class="px-5 py-3">Epic</th>
            <th class="px-5 py-3 text-right">Time Spent</th>
            <th class="px-5 py-3 text-right">Percentage</th>
        </tr>
    `;

    // Update download button for user mode
    document.getElementById("btn-dl-left").setAttribute("onclick", "downloadEpicCSV()");

    document.getElementById("analysis-panel").classList.remove("hidden");
    document.getElementById("total-time-banner").textContent = data.total_str;

    renderEpicTable(data.epicData);
    renderCategoryTable(data.categoryData);
    renderIssueTable(data.issueData);
    renderEpicChart(data.epicData);
    renderCategoryChart(data.categoryData);
}

// ─── Project Mode Dashboard Rendering ────────────────────────────────────────

function renderProjectDashboard(data) {
    if (!data || data.totalSeconds === 0) {
        alert("No worklogs found for this Epic.");
        document.getElementById("dashboard-empty").classList.remove("hidden");
        return;
    }

    // Show project-specific panels
    document.getElementById("epic-metadata-card").classList.remove("hidden");
    document.getElementById("executive-learnings-card").classList.remove("hidden");

    // Populate metadata card
    const m = data.metadata;
    const epicUrl = m.url || `https://jira.brodos.net/browse/${m.key}`;

    // Show Jira epic link on Title
    document.getElementById("meta-title").innerHTML = `
        <a href="${epicUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline font-bold inline-flex items-center gap-1.5">
            <span>${m.title}</span>
            <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
        </a>
    `;

    document.getElementById("meta-status").textContent = m.status;
    document.getElementById("meta-priority").textContent = m.priority;
    document.getElementById("meta-duedate").textContent = m.dueDate;
    document.getElementById("meta-created").textContent = m.created;
    document.getElementById("meta-updated").textContent = m.updated;
    document.getElementById("meta-cost-unit").textContent = m.costUnitNumber;

    // Render Brodos Project Number with link if available
    const projElem = document.getElementById("meta-project-num");
    if (m.brodosProjectNumber && m.brodosProjectNumber !== "N/A") {
        const pUrl = m.brodosProjectUrl || `https://jira.brodos.net/browse/${m.brodosProjectNumber}`;
        projElem.innerHTML = `
            <a href="${pUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline font-bold inline-flex items-center gap-1">
                <span>${m.brodosProjectNumber}</span>
                <i class="fa-solid fa-arrow-up-right-from-square text-2xs"></i>
            </a>
        `;
    } else {
        projElem.textContent = "N/A";
    }

    // Labels
    const labelsContainer = document.getElementById("meta-labels");
    labelsContainer.innerHTML = "";
    if (m.labels && m.labels.length > 0) {
        m.labels.forEach(label => {
            const span = document.createElement("span");
            span.className = "bg-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-0.5 rounded-full";
            span.textContent = label;
            labelsContainer.appendChild(span);
        });
    } else {
        labelsContainer.innerHTML = '<span class="text-slate-400 italic text-xs">None</span>';
    }

    // Update titles for project mode
    document.getElementById("chart-left-title").textContent = "Category-wise Effort Distribution";
    document.getElementById("chart-right-title").textContent = "User-wise Effort Distribution";
    document.getElementById("table-left-title").textContent = "Team Member Contributions";
    document.getElementById("table-detailed-title").textContent = "Category → Issue Breakdown";

    // Update left table header for project mode (User table)
    document.getElementById("table-left-head").innerHTML = `
        <tr>
            <th class="px-5 py-3">Team Member</th>
            <th class="px-5 py-3 text-right">Time Spent</th>
            <th class="px-5 py-3 text-right">Percentage</th>
        </tr>
    `;

    // Update download button for project mode
    document.getElementById("btn-dl-left").setAttribute("onclick", "downloadUserDistributionCSV()");

    // Update detailed table header for project mode (nested category-issue)
    document.getElementById("detailed-table-head").innerHTML = `
        <tr>
            <th class="px-5 py-3" style="width: 40px"></th>
            <th class="px-5 py-3">Issue / Category</th>
            <th class="px-5 py-3">Category</th>
            <th class="px-5 py-3 text-right">Time Spent</th>
            <th class="px-5 py-3 text-right">Percentage</th>
        </tr>
    `;

    document.getElementById("analysis-panel").classList.remove("hidden");
    document.getElementById("total-time-banner").textContent = data.total_str;

    // Render project-specific views
    renderUserTable(data.userData);
    renderCategoryTable(data.categoryData);
    renderCategoryChart_Project(data.categoryData);
    renderUserChart(data.userData);
    renderNestedCategoryIssueTable(data.issueData, data.categoryData);
    generateExecutiveLearnings(data.categoryData, data.userData, data.totalSeconds);
}

// ─── Table Renderers ─────────────────────────────────────────────────────────

function renderEpicTable(epicData) {
    const tbody = document.getElementById("epic-table-body");
    tbody.innerHTML = "";
    epicData.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-slate-100 hover:bg-slate-50";
        tr.innerHTML = `
            <td class="px-5 py-3 font-semibold text-blue-600">
                ${item.key !== 'No Epic' ? `<a href="${item.url}" target="_blank">${item.key}</a>` : 'N/A'}
            </td>
            <td class="px-5 py-3 text-slate-600 truncate max-w-xs">${item.summary}</td>
            <td class="px-5 py-3 text-right font-medium text-slate-900">${item.time_str}</td>
            <td class="px-5 py-3 text-right font-semibold text-slate-500">${item.percentage}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderUserTable(userData) {
    const tbody = document.getElementById("epic-table-body");
    tbody.innerHTML = "";
    userData.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-slate-100 hover:bg-slate-50";
        tr.innerHTML = `
            <td class="px-5 py-3 font-semibold text-slate-800">
                <i class="fa-solid fa-user-circle text-blue-400 mr-1.5"></i>${item.username}
            </td>
            <td class="px-5 py-3 text-right font-medium text-slate-900">${item.time_str}</td>
            <td class="px-5 py-3 text-right font-semibold text-slate-500">${item.percentage}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCategoryTable(categoryData) {
    const tbody = document.getElementById("category-table-body");
    tbody.innerHTML = "";
    categoryData.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-slate-100 hover:bg-slate-50";
        tr.innerHTML = `
            <td class="px-5 py-3 font-semibold text-slate-700">${item.category}</td>
            <td class="px-5 py-3 text-right font-medium text-slate-900">${item.time_str}</td>
            <td class="px-5 py-3 text-right font-semibold text-slate-500">${item.percentage}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderIssueTable(issueData) {
    const tbody = document.getElementById("issue-table-body");
    tbody.innerHTML = "";
    issueData.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-slate-100 hover:bg-slate-50";
        tr.innerHTML = `
            <td class="px-5 py-3 font-semibold text-blue-600">
                <a href="${item.url}" target="_blank">${item.key}</a>
            </td>
            <td class="px-5 py-3 text-slate-600 truncate max-w-sm">${item.summary}</td>
            <td class="px-5 py-3 text-slate-500 truncate max-w-xs">${item.epic_summary}</td>
            <td class="px-5 py-3 text-right font-medium text-slate-900">${item.time_str}</td>
            <td class="px-5 py-3 text-right font-semibold text-slate-500">${item.percentage}%</td>
        `;
        tbody.appendChild(tr);
    });
}

// ─── Nested Category → Issue Breakdown Table (Project Mode) ──────────────────

function renderNestedCategoryIssueTable(issueData, categoryData) {
    const tbody = document.getElementById("issue-table-body");
    tbody.innerHTML = "";

    const categoryIssues = {};
    categoryData.forEach(cat => {
        categoryIssues[cat.category] = {
            issues: [],
            time_str: cat.time_str,
            percentage: cat.percentage,
            seconds: cat.seconds
        };
    });

    issueData.forEach(issue => {
        const cat = issue.category || "Pure Implementation / Coding";
        if (!categoryIssues[cat]) {
            categoryIssues[cat] = { issues: [], time_str: "0m", percentage: 0, seconds: 0 };
        }
        categoryIssues[cat].issues.push(issue);
    });

    let catIndex = 0;
    for (const [catName, catInfo] of Object.entries(categoryIssues)) {
        const catColor = CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length];
        const catId = `cat-${catIndex}`;

        const catRow = document.createElement("tr");
        catRow.className = "border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition";
        catRow.setAttribute("onclick", `toggleCategoryExpand('${catId}')`);
        catRow.innerHTML = `
            <td class="px-5 py-3 text-center">
                <i class="fa-solid fa-chevron-right text-xs text-slate-400 transition-transform" id="icon-${catId}"></i>
            </td>
            <td class="px-5 py-3 font-bold text-slate-800">
                <span class="inline-block w-3 h-3 rounded-full mr-2" style="background-color: ${catColor}"></span>
                ${catName}
                <span class="text-xs text-slate-400 ml-2">(${catInfo.issues.length} issue${catInfo.issues.length !== 1 ? 's' : ''})</span>
            </td>
            <td class="px-5 py-3 text-slate-500 text-sm">${catName}</td>
            <td class="px-5 py-3 text-right font-bold text-slate-900">${catInfo.time_str}</td>
            <td class="px-5 py-3 text-right font-bold text-blue-600">${catInfo.percentage}%</td>
        `;
        tbody.appendChild(catRow);

        catInfo.issues.forEach(issue => {
            const issueRow = document.createElement("tr");
            issueRow.className = `border-b border-slate-100 hover:bg-blue-50/50 hidden cat-child-${catId}`;
            issueRow.innerHTML = `
                <td class="px-5 py-2.5"></td>
                <td class="px-5 py-2.5 pl-10 text-sm">
                    <a href="${issue.url}" target="_blank" class="text-blue-600 font-semibold hover:underline">${issue.key}</a>
                    <span class="text-slate-500 ml-2">${issue.summary}</span>
                </td>
                <td class="px-5 py-2.5 text-slate-400 text-xs">${issue.category || ''}</td>
                <td class="px-5 py-2.5 text-right font-medium text-slate-800 text-sm">${issue.time_str}</td>
                <td class="px-5 py-2.5 text-right text-slate-500 text-sm">${issue.percentage}%</td>
            `;
            tbody.appendChild(issueRow);
        });

        catIndex++;
    }
}

function toggleCategoryExpand(catId) {
    const icon = document.getElementById(`icon-${catId}`);
    const rows = document.querySelectorAll(`.cat-child-${catId}`);
    const isExpanded = !rows[0]?.classList.contains("hidden");

    rows.forEach(row => {
        if (isExpanded) {
            row.classList.add("hidden");
        } else {
            row.classList.remove("hidden");
        }
    });

    if (icon) {
        icon.style.transform = isExpanded ? "rotate(0deg)" : "rotate(90deg)";
    }
}

// ─── Chart Renderers ─────────────────────────────────────────────────────────

function renderEpicChart(epicData) {
    const ctx = document.getElementById('epicChart').getContext('2d');
    const labels = epicData.map(x => x.key);
    const data = epicData.map(x => x.percentage);
    const tooltips = epicData.map(x => ({ summary: x.summary, time: x.time_str }));

    const existingChart = Chart.getChart('epicChart');
    if (existingChart) existingChart.destroy();
    if (epicChartInstance) {
        try { epicChartInstance.destroy(); } catch(e) {}
    }

    epicChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const item = tooltips[index];
                            return [
                                `Epic: ${context.label}`,
                                `Title: ${item.summary}`,
                                `Time Logged: ${item.time} (${context.raw}%)`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function renderCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const labels = categoryData.map(x => x.category);
    const data = categoryData.map(x => x.percentage);
    const tooltips = categoryData.map(x => ({ time: x.time_str }));

    const existingChart = Chart.getChart('categoryChart');
    if (existingChart) existingChart.destroy();
    if (categoryChartInstance) {
        try { categoryChartInstance.destroy(); } catch(e) {}
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CATEGORY_COLORS.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const item = tooltips[index];
                            return [
                                `Category: ${context.label}`,
                                `Time Logged: ${item.time} (${context.raw}%)`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function renderCategoryChart_Project(categoryData) {
    const ctx = document.getElementById('epicChart').getContext('2d');
    const labels = categoryData.map(x => x.category);
    const data = categoryData.map(x => x.percentage);
    const tooltips = categoryData.map(x => ({ time: x.time_str }));

    const existingChart = Chart.getChart('epicChart');
    if (existingChart) existingChart.destroy();
    if (epicChartInstance) {
        try { epicChartInstance.destroy(); } catch(e) {}
    }

    epicChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CATEGORY_COLORS.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const item = tooltips[index];
                            return [
                                `Category: ${context.label}`,
                                `Time Logged: ${item.time} (${context.raw}%)`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function renderUserChart(userData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const labels = userData.map(x => x.username);
    const data = userData.map(x => x.percentage);
    const tooltips = userData.map(x => ({ time: x.time_str }));

    const existingChart = Chart.getChart('categoryChart');
    if (existingChart) existingChart.destroy();
    if (categoryChartInstance) {
        try { categoryChartInstance.destroy(); } catch(e) {}
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const item = tooltips[index];
                            return [
                                `Contributor: ${context.label}`,
                                `Time Logged: ${item.time} (${context.raw}%)`
                            ];
                        }
                    }
                }
            }
        }
    });
}

// ─── Executive Learnings Generator (Deterministic, No AI) ────────────────────

function generateExecutiveLearnings(categoryData, userData, totalSeconds) {
    const totalHours = (totalSeconds / 3600).toFixed(1);

    let driversHTML = '<ul class="list-disc list-inside space-y-1.5">';
    const sorted = [...categoryData].sort((a, b) => b.percentage - a.percentage);

    sorted.forEach(cat => {
        const hours = (cat.seconds / 3600).toFixed(1);
        let insight = '';
        if (cat.category.includes("Spike") || cat.category.includes("Setup")) {
            insight = `Technical spikes and environment setup consumed <strong>${cat.percentage}%</strong> (${hours}h) of total project effort, indicating significant upfront infrastructure investment.`;
        } else if (cat.category.includes("Architecture") || cat.category.includes("Analysis")) {
            insight = `Architecture reviews and analysis accounted for <strong>${cat.percentage}%</strong> (${hours}h), reflecting the complexity of requirements and design work.`;
        } else if (cat.category.includes("Refinement") || cat.category.includes("Planning")) {
            insight = `Refinement and planning activities consumed <strong>${cat.percentage}%</strong> (${hours}h), indicating ${cat.percentage > 15 ? 'high Agile process overhead' : 'standard Scrum process investment'}.`;
        } else if (cat.category.includes("Collaboration") || cat.category.includes("Review")) {
            insight = `Collaborations and reviews accounted for <strong>${cat.percentage}%</strong> (${hours}h) of the total effort, reflecting ${cat.percentage > 20 ? 'significant cross-team coordination overhead' : 'healthy team alignment practices'}.`;
        } else if (cat.category.includes("GenAI")) {
            insight = `GenAI tooling and learning activities consumed <strong>${cat.percentage}%</strong> (${hours}h), representing the team's investment in AI-augmented development practices.`;
        } else if (cat.category.includes("Implementation") || cat.category.includes("Coding")) {
            insight = `Core implementation and coding represented <strong>${cat.percentage}%</strong> (${hours}h) of total effort — the primary value-delivering activity.`;
        } else {
            insight = `"${cat.category}" accounted for <strong>${cat.percentage}%</strong> (${hours}h) of total project time.`;
        }
        driversHTML += `<li>${insight}</li>`;
    });
    driversHTML += '</ul>';

    let recsHTML = '<ul class="list-disc list-inside space-y-1.5">';
    const nonCodeCategories = sorted.filter(c => !c.category.includes("Implementation") && !c.category.includes("Coding"));
    const overheadPct = nonCodeCategories.reduce((sum, c) => sum + c.percentage, 0);
    const codePct = 100 - overheadPct;

    recsHTML += `<li>Overall delivery efficiency: <strong>${codePct.toFixed(1)}%</strong> of project time went to direct implementation. ${codePct < 40 ? '<strong class="text-red-700">This is below the 40% benchmark — consider streamlining non-coding activities.</strong>' : codePct < 60 ? 'Consider reviewing process overhead to improve delivery throughput.' : 'This is within healthy engineering benchmarks.'}</li>`;

    const spikeCategory = sorted.find(c => c.category.includes("Spike") || c.category.includes("Setup"));
    if (spikeCategory && spikeCategory.percentage > 10) {
        recsHTML += `<li>Isolate technical spikes (e.g., Keycloak, infrastructure setup) into upfront individual POCs prior to feature implementation sprints to reduce team-wide drag.</li>`;
    }

    const planningCategory = sorted.find(c => c.category.includes("Refinement") || c.category.includes("Planning"));
    if (planningCategory && planningCategory.percentage > 15) {
        recsHTML += `<li>Grooming and Agile process consumed ${planningCategory.percentage}% — consider time-boxing refinement sessions and using async pre-refinement documentation.</li>`;
    }

    const collabCategory = sorted.find(c => c.category.includes("Collaboration") || c.category.includes("Review"));
    if (collabCategory && collabCategory.percentage > 20) {
        recsHTML += `<li>High collaboration overhead (${collabCategory.percentage}%) — evaluate if some meetings can be replaced with async communication or decision documents.</li>`;
    }

    if (userData.length > 0) {
        const topContributor = userData[0];
        const bottomContributor = userData[userData.length - 1];
        if (userData.length > 1 && topContributor.percentage > 40) {
            recsHTML += `<li>Workload imbalance detected: <strong>${topContributor.username}</strong> contributed ${topContributor.percentage}% while <strong>${bottomContributor.username}</strong> contributed ${bottomContributor.percentage}%. Consider more equitable task distribution for team sustainability.</li>`;
        }
    }

    recsHTML += `<li>Total project investment: <strong>${totalHours} hours</strong> across <strong>${userData.length} team member${userData.length !== 1 ? 's' : ''}</strong> distributed over <strong>${sorted.length} activity categories</strong>.</li>`;
    recsHTML += '</ul>';

    document.getElementById("learnings-drivers").innerHTML = driversHTML;
    document.getElementById("learnings-recommendations").innerHTML = recsHTML;
}

// ─── Rules Configuration Engine Logic ────────────────────────────────────────

let localRules = {};

function toggleRulesModal(show) {
    const modal = document.getElementById("rules-modal");
    if (show) {
        modal.classList.remove("hidden");
        renderRulesUI();
    } else {
        modal.classList.add("hidden");
    }
}

function loadRules() {
    fetch("/api/rules")
    .then(resp => resp.json())
    .then(data => {
        localRules = data.rules;
    })
    .catch(err => console.error("Error fetching rules:", err));
}

function renderRulesUI() {
    const container = document.getElementById("rules-list-container");
    container.innerHTML = "";

    Object.entries(localRules).forEach(([category, keywords]) => {
        const catDiv = document.createElement("div");
        catDiv.className = "p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3";
        catDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-bold text-slate-900 text-sm">${category}</span>
                <button onclick="removeCategory('${category}')" class="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center space-x-1">
                    <i class="fa-solid fa-trash-can"></i>
                    <span>Delete Category</span>
                </button>
            </div>
            <div class="flex flex-wrap gap-2" id="keywords-${category}">
                ${keywords.map((kw, i) => `
                    <span class="bg-white border border-slate-200 text-slate-700 text-xs px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm">
                        <span>${kw}</span>
                        <button onclick="removeKeyword('${category}', ${i})" class="text-slate-400 hover:text-red-500 transition">
                            <i class="fa-solid fa-xmark text-2xs"></i>
                        </button>
                    </span>
                `).join("")}
                <button onclick="showAddKeywordInput('${category}')" id="add-kw-btn-${category}" class="bg-white hover:bg-slate-100 border border-slate-200 text-blue-600 text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-sm transition">
                    <i class="fa-solid fa-plus text-2xs"></i>
                    <span>Add Keyword</span>
                </button>
                <div id="add-kw-input-wrapper-${category}" class="hidden flex items-center space-x-1.5">
                    <input type="text" id="add-kw-input-${category}" placeholder="New keyword" class="py-1 px-2.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 bg-white">
                    <button onclick="submitKeyword('${category}')" class="bg-blue-600 text-white p-1.5 rounded-lg text-xs hover:bg-blue-700 transition">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button onclick="hideAddKeywordInput('${category}')" class="bg-slate-200 text-slate-600 p-1.5 rounded-lg text-xs hover:bg-slate-300 transition">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(catDiv);
    });
}

function removeCategory(category) {
    delete localRules[category];
    renderRulesUI();
}

function removeKeyword(category, index) {
    localRules[category].splice(index, 1);
    renderRulesUI();
}

function showAddKeywordInput(category) {
    document.getElementById(`add-kw-btn-${category}`).classList.add("hidden");
    document.getElementById(`add-kw-input-wrapper-${category}`).classList.remove("hidden");
    document.getElementById(`add-kw-input-${category}`).focus();
}

function hideAddKeywordInput(category) {
    document.getElementById(`add-kw-btn-${category}`).classList.remove("hidden");
    document.getElementById(`add-kw-input-wrapper-${category}`).classList.add("hidden");
    document.getElementById(`add-kw-input-${category}`).value = "";
}

function submitKeyword(category) {
    const val = document.getElementById(`add-kw-input-${category}`).value.trim();
    if (val) {
        if (!localRules[category].includes(val)) {
            localRules[category].push(val);
        }
        hideAddKeywordInput(category);
        renderRulesUI();
    }
}

function addNewCategory() {
    const catName = prompt("Enter the name of the new Activity Category:");
    if (catName) {
        const cleaned = catName.trim();
        if (cleaned && !localRules[cleaned]) {
            localRules[cleaned] = [];
            renderRulesUI();
        }
    }
}

function saveRules() {
    fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: localRules })
    })
    .then(async resp => {
        if (!resp.ok) {
            throw new Error("Failed to save rules config.");
        }
        alert("Rules saved and updated successfully.");
        toggleRulesModal(false);
        loadRules();
    })
    .catch(err => {
        alert(err.message);
    });
}

// ─── CSV Download Helpers ────────────────────────────────────────────────────

function escapeCSVValue(value) {
    if (value === null || value === undefined) return "";
    let str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function getFilenameTimestamp() {
    if (currentMode === 'project') {
        const epicKey = document.getElementById("epic-key").value.trim() || "Epic";
        return epicKey;
    } else {
        const start = document.getElementById("start-date").value;
        const end = document.getElementById("end-date").value;
        return `${start}_to_${end}`;
    }
}

// ─── User Mode CSV Downloads ─────────────────────────────────────────────────

function downloadEpicCSV() {
    if (!currentAnalysisData || !currentAnalysisData.epicData || !currentAnalysisData.epicData.length) {
        alert("No active data to download.");
        return;
    }
    let csv = "Epic Key,Epic Summary,Time Spent,Percentage\n";
    currentAnalysisData.epicData.forEach(item => {
        csv += `${escapeCSVValue(item.key)},${escapeCSVValue(item.summary)},${escapeCSVValue(item.time_str)},${item.percentage}%\n`;
    });
    downloadCSV(csv, `Epic_Distribution_${getFilenameTimestamp()}.csv`);
}

function downloadCategoryCSV() {
    if (!currentAnalysisData || !currentAnalysisData.categoryData || !currentAnalysisData.categoryData.length) {
        alert("No active data to download.");
        return;
    }
    let csv = "Category,Time Spent,Percentage\n";
    currentAnalysisData.categoryData.forEach(item => {
        csv += `${escapeCSVValue(item.category)},${escapeCSVValue(item.time_str)},${item.percentage}%\n`;
    });
    downloadCSV(csv, `Activity_Category_Distribution_${getFilenameTimestamp()}.csv`);
}

function downloadIssueCSV() {
    if (!currentAnalysisData || !currentAnalysisData.issueData || !currentAnalysisData.issueData.length) {
        alert("No active data to download.");
        return;
    }
    if (currentMode === 'project') {
        let csv = "Issue Key,Summary,Category,Time Spent,Percentage,URL\n";
        currentAnalysisData.issueData.forEach(item => {
            csv += `${escapeCSVValue(item.key)},${escapeCSVValue(item.summary)},${escapeCSVValue(item.category)},${escapeCSVValue(item.time_str)},${item.percentage}%,${escapeCSVValue(item.url)}\n`;
        });
        downloadCSV(csv, `Project_Issue_Breakdown_${getFilenameTimestamp()}.csv`);
    } else {
        let csv = "Issue Key,Issue Summary,Epic Key,Epic Summary,Time Spent,Percentage\n";
        currentAnalysisData.issueData.forEach(item => {
            csv += `${escapeCSVValue(item.key)},${escapeCSVValue(item.summary)},${escapeCSVValue(item.epic_key)},${escapeCSVValue(item.epic_summary)},${escapeCSVValue(item.time_str)},${item.percentage}%\n`;
        });
        downloadCSV(csv, `Issue_Breakdown_${getFilenameTimestamp()}.csv`);
    }
}

function downloadDetailedWorklogsCSV() {
    if (!currentAnalysisData || !currentAnalysisData.detailedWorklogs || !currentAnalysisData.detailedWorklogs.length) {
        alert("No detailed worklogs available. Execute an analysis first.");
        return;
    }
    if (currentMode === 'project') {
        let csv = "Jira Issue Key,Issue Summary,Author,Started,Duration,Comment\n";
        currentAnalysisData.detailedWorklogs.forEach(item => {
            csv += `${escapeCSVValue(item.issueKey)},${escapeCSVValue(item.issueSummary)},${escapeCSVValue(item.author)},${escapeCSVValue(item.started)},${escapeCSVValue(item.timeSpentStr)},${escapeCSVValue(item.comment)}\n`;
        });
        downloadCSV(csv, `Project_Detailed_Worklogs_${getFilenameTimestamp()}.csv`);
    } else {
        let csv = "Jira Issue Key,Issue Summary,Epic Key,Epic Summary,Started,Duration,Comment\n";
        currentAnalysisData.detailedWorklogs.forEach(item => {
            csv += `${escapeCSVValue(item.issueKey)},${escapeCSVValue(item.issueSummary)},${escapeCSVValue(item.epicKey)},${escapeCSVValue(item.epicSummary)},${escapeCSVValue(item.started)},${escapeCSVValue(item.timeSpentStr)},${escapeCSVValue(item.comment)}\n`;
        });
        downloadCSV(csv, `Detailed_Worklogs_${getFilenameTimestamp()}.csv`);
    }
}

// ─── Project Mode CSV Downloads ──────────────────────────────────────────────

function downloadUserDistributionCSV() {
    if (!currentAnalysisData || !currentAnalysisData.userData || !currentAnalysisData.userData.length) {
        alert("No active data to download.");
        return;
    }
    let csv = "Team Member,Time Spent,Percentage\n";
    currentAnalysisData.userData.forEach(item => {
        csv += `${escapeCSVValue(item.username)},${escapeCSVValue(item.time_str)},${item.percentage}%\n`;
    });
    downloadCSV(csv, `User_Distribution_${getFilenameTimestamp()}.csv`);
}
