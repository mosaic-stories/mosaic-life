from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@router.get("/readyz")
def readyz() -> dict[str, bool]:
    # TODO: implement dependency checks (DB, OpenSearch) in later sprints
    return {"ready": True}
