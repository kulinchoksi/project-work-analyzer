import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.models import AnalyzeRequest, AnalyzeResponse, AnalyzeEpicRequest, EpicAnalyzeResponse, RulesResponse, RulesUpdateRequest
from backend.services.jira_client import JiraClient
from backend.services.categorizer import Categorizer

app = FastAPI(title="Jira Work Analyzer API")

# Add CORS Middleware to support development servers if run separately
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

categorizer = Categorizer()

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_worklogs(req: AnalyzeRequest):
    try:
        client = JiraClient(username=req.username, password=req.password)
        result = client.analyze_worklogs(req.startDate, req.endDate)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/analyze/epic", response_model=EpicAnalyzeResponse)
def analyze_epic_worklogs(req: AnalyzeEpicRequest):
    try:
        client = JiraClient(username=req.username, password=req.password)
        result = client.analyze_epic_worklogs(req.epicKey)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/rules", response_model=RulesResponse)
def get_rules():
    rules = categorizer.load_rules()
    return {"rules": rules}

@app.post("/api/rules")
def update_rules(req: RulesUpdateRequest):
    success = categorizer.save_rules(req.rules)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save categorization rules.")
    return {"status": "success", "message": "Rules updated successfully."}

# Custom StaticFiles to prevent browser caching of frontend assets during development
class NoCacheStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

# Serve Frontend static assets
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", NoCacheStaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def read_root():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(
                index_file,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
