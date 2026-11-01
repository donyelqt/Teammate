from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Teammate API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str = Field(description="Service liveness.")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
