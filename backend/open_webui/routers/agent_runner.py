import logging
import os
from collections.abc import AsyncGenerator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

log = logging.getLogger(__name__)

router = APIRouter()

AGENT_RUNNER_URL = os.environ.get('AGENT_RUNNER_URL', 'http://100.85.133.20:8003')
AGENT_RUNNER_TOKEN = os.environ.get('AGENT_RUNNER_TOKEN', 'change-me-in-production')


def _headers():
    return {'X-Agent-Token': AGENT_RUNNER_TOKEN}


@router.get('/runs')
async def list_runs():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f'{AGENT_RUNNER_URL}/runs',
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return JSONResponse(
            status_code=exc.response.status_code,
            content={'detail': exc.response.text},
        )
    except Exception as exc:
        log.warning('[agent_runner] list_runs failed: %s', exc)
        return JSONResponse(status_code=502, content={'detail': str(exc)})


@router.get('/run/{run_id}/status')
async def run_status(run_id: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f'{AGENT_RUNNER_URL}/run/{run_id}/status',
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return JSONResponse(
            status_code=exc.response.status_code,
            content={'detail': exc.response.text},
        )
    except Exception as exc:
        log.warning('[agent_runner] run_status failed: %s', exc)
        return JSONResponse(status_code=502, content={'detail': str(exc)})


@router.post('/run/{run_id}/resume')
async def resume_run(run_id: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f'{AGENT_RUNNER_URL}/run/{run_id}/resume',
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return JSONResponse(
            status_code=exc.response.status_code,
            content={'detail': exc.response.text},
        )
    except Exception as exc:
        log.warning('[agent_runner] resume_run failed for %s: %s', run_id, exc)
        return JSONResponse(status_code=502, content={'detail': str(exc)})


@router.get('/run/{run_id}/stream')
async def stream_run(run_id: str, request: Request):
    timeout = httpx.Timeout(connect=10.0, read=720.0, write=10.0, pool=10.0)

    async def event_proxy() -> AsyncGenerator[bytes, None]:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    'GET',
                    f'{AGENT_RUNNER_URL}/run/{run_id}/stream',
                    headers=_headers(),
                ) as upstream:
                    async for chunk in upstream.aiter_bytes():
                        if await request.is_disconnected():
                            break
                        yield chunk
        except Exception as exc:
            log.warning("[agent_runner] stream proxy error for %s: %s", run_id, exc)
            yield f"data: {{\"type\":\"proxy_error\",\"error\":\"{exc}\"}}\n\n".encode()

    return StreamingResponse(
        event_proxy(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )
