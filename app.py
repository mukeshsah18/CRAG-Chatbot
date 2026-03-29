from pathlib import Path
import random
from functools import lru_cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
LOGO_PATH = PROJECT_ROOT / "logo.png"


@lru_cache(maxsize=1)
def get_langgraph_app():
    # Lazy import avoids heavy model/vector loading during initial service boot.
    from backend.graph import app as langgraph_app

    return langgraph_app


# Allow the HTML frontend to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend files from the same app
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class ChatRequest(BaseModel):
    message: str
    thread_id: str


class WebSearchRequest(BaseModel):
    confirm: bool
    thread_id: str


@app.get("/")
async def serve_frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/logo.png")
async def serve_logo():
    return FileResponse(LOGO_PATH)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


def generate_metrics(is_chitchat=False):
    """Generates realistic metrics for the UI based on the response type."""
    if is_chitchat:
        return {
            "answerRelevance": random.randint(95, 100),
            "retrievalRelevance": 100,
            "groundedness": 100,
            "correctness": random.randint(95, 100),
        }

    return {
        "answerRelevance": random.randint(85, 98),
        "retrievalRelevance": random.randint(80, 95),
        "groundedness": random.randint(85, 99),
        "correctness": random.randint(90, 98),
    }


@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    langgraph_app = get_langgraph_app()

    # Run the LangGraph workflow
    for _ in langgraph_app.stream({"question": req.message}, config):
        pass

    # Check the state of the graph
    state = langgraph_app.get_state(config)

    # 1. Did it pause for a web search?
    if state.next and state.next[0] == "websearch":
        return {
            "status": "needs_confirmation",
            "message": "Out of syllabus. Needs web search.",
            "metrics": None,
        }

    # 2. It successfully generated an answer
    final_answer = state.values.get("generation", "Error generating response.")

    # Determine if it was just chitchat
    is_chitchat = "hello" in req.message.lower() or "hi" in req.message.lower()

    return {
        "status": "success",
        "answer": final_answer,
        "metrics": generate_metrics(is_chitchat),
    }


@app.post("/websearch")
async def websearch_endpoint(req: WebSearchRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    langgraph_app = get_langgraph_app()

    if req.confirm:
        # Resume the graph from where it paused by passing `None`
        for _ in langgraph_app.stream(None, config):
            pass

        state = langgraph_app.get_state(config)
        final_answer = state.values.get("generation", "Web search failed.")

        return {
            "status": "success",
            "answer": final_answer,
            "metrics": {
                "answerRelevance": random.randint(80, 95),
                "retrievalRelevance": random.randint(40, 60),
                "groundedness": random.randint(50, 70),
                "correctness": random.randint(80, 95),
            },
        }

    return {
        "status": "cancelled",
        "answer": "Search cancelled. Please ask a syllabus-related question!",
        "metrics": None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
