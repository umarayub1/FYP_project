import redis as redis_lib
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.ai_router import router as ai_router
from app.routers.internal_router import router as internal_router

app = FastAPI(title="Synapse AI Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    try:
        r = redis_lib.from_url(settings.redis_url)
        r.ping()
        print("Redis connected")
    except Exception as exc:
        print(f"Redis connection failed: {exc}")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "ai-engine"}


app.include_router(ai_router, prefix="/api/ai")
app.include_router(internal_router, prefix="/internal")


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
