from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@router.get("/readyz")
def readyz() -> dict:
    # TODO: implement dependency checks (DB, OpenSearch) in later sprints
    return {"ready": True}

