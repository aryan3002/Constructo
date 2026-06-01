"""Application error type and JSON error-envelope handlers.

Every error response follows: {"error": {"code": str, "message": str}}.
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Raise to return a structured error envelope with an explicit HTTP status.

    ``extra`` carries machine-readable affordances merged into the error object
    so a refusal can be a graceful handoff rather than a bare wall — e.g. a
    403 on *approve* that still tells the client ``can_comment: true``.
    """

    def __init__(
        self, status_code: int, code: str, message: str, *, extra: dict | None = None
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.extra = extra
        super().__init__(message)


def _envelope(
    status_code: int, code: str, message: str, extra: dict | None = None
) -> JSONResponse:
    error: dict = {"code": code, "message": message}
    if extra:
        error.update(extra)
    return JSONResponse(status_code=status_code, content={"error": error})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _envelope(exc.status_code, exc.code, exc.message, exc.extra)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _envelope(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _envelope(422, "validation_error", "Request validation failed")
