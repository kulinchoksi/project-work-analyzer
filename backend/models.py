from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class AnalyzeRequest(BaseModel):
    username: str = Field(..., description="Jira username")
    password: str = Field(..., description="Jira password or API token")
    startDate: str = Field(..., description="Start date (YYYY-MM-DD)")
    endDate: str = Field(..., description="End date (YYYY-MM-DD)")
    targetUser: Optional[str] = Field(None, description="Optional target Jira username to analyze")

class AnalyzeEpicRequest(BaseModel):
    username: str = Field(..., description="Jira username")
    password: str = Field(..., description="Jira password or API token")
    epicKey: str = Field(..., description="Jira Epic Issue Key (e.g. STORESHIP-15121)")

class EpicItem(BaseModel):
    key: str
    summary: str
    seconds: int
    time_str: str
    percentage: float
    url: str

class IssueItem(BaseModel):
    key: str
    summary: str
    epic_key: str
    epic_summary: str
    seconds: int
    time_str: str
    percentage: float
    url: str
    category: Optional[str] = None

class CategoryItem(BaseModel):
    category: str
    seconds: int
    time_str: str
    percentage: float

class DetailedWorklogItem(BaseModel):
    issueKey: str
    issueSummary: str
    epicKey: str
    epicSummary: str
    comment: str
    started: str
    timeSpentStr: str
    author: Optional[str] = None

class AnalyzeResponse(BaseModel):
    totalSeconds: int
    total_str: str
    epicData: List[EpicItem]
    issueData: List[IssueItem]
    categoryData: List[CategoryItem]
    detailedWorklogs: List[DetailedWorklogItem] = Field(default_factory=list)

class EpicMetadata(BaseModel):
    key: str
    title: str
    status: str
    priority: str
    dueDate: str
    created: str
    updated: str
    labels: List[str]
    costUnitNumber: str
    brodosProjectNumber: str
    url: Optional[str] = None
    brodosProjectUrl: Optional[str] = None

class UserContributionItem(BaseModel):
    username: str
    seconds: int
    time_str: str
    percentage: float

class EpicAnalyzeResponse(BaseModel):
    totalSeconds: int
    total_str: str
    metadata: EpicMetadata
    categoryData: List[CategoryItem]
    userData: List[UserContributionItem]
    issueData: List[IssueItem]
    detailedWorklogs: List[DetailedWorklogItem]

class RulesResponse(BaseModel):
    rules: Dict[str, List[str]]

class RulesUpdateRequest(BaseModel):
    rules: Dict[str, List[str]]
