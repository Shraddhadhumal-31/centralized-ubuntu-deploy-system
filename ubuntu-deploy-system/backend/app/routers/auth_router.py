from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..config import get_settings
from ..auth import create_access_token, verify_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    settings = get_settings()
    if (
        req.username != settings.ADMIN_USERNAME
        or req.password != settings.ADMIN_PASSWORD
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(req.username)
    return LoginResponse(access_token=token)


@router.get("/me")
async def get_current_user(username: str = Depends(verify_token)):
    return {"username": username}
