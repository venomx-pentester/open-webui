import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from open_webui.utils.auth import get_admin_user

log = logging.getLogger(__name__)

router = APIRouter()

ADMIN_API_URL = os.environ.get('ADMIN_API_URL', '').rstrip('/')
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '')


def _admin_headers() -> dict[str, str]:
    return {'Authorization': f'Bearer {ADMIN_TOKEN}'}


def _require_admin_api_config() -> None:
    if not ADMIN_API_URL or not ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='S4 guard notifications are not configured for this OpenWebUI instance.',
        )


@router.get('/notifications/s4')
async def get_s4_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    user=Depends(get_admin_user),
):
    _require_admin_api_config()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f'{ADMIN_API_URL}/api/notifications/s4',
                params={'limit': limit},
                headers=_admin_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, list):
                raise ValueError('Expected a list of S4 notifications')
            return data
    except httpx.HTTPStatusError as exc:
        return JSONResponse(
            status_code=exc.response.status_code,
            content={'detail': exc.response.text},
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning('[guard] failed to load S4 notifications: %s', exc)
        return JSONResponse(status_code=502, content={'detail': str(exc)})
