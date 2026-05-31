from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from persistence import get_session, get_user, list_events

router = APIRouter()


class EventOut(BaseModel):
    type: str
    payload: dict[str, Any] | None
    created_at: str | None


async def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _payload(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _json_dt(value: Any) -> str | None:
    return value.isoformat() if value else None


@router.get("/users/{email}/events", response_model=list[EventOut])
async def user_events(email: str, db: Session = Depends(get_db)) -> list[EventOut]:
    if not get_user(db, email):
        raise HTTPException(status_code=404, detail="User not found")

    return [
        EventOut(
            type=event.type,
            payload=_payload(event.payload),
            created_at=_json_dt(event.created_at),
        )
        for event in list_events(db, email)
    ]
