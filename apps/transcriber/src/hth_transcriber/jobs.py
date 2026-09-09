"""In-process job store.

An import takes tens of seconds — downloading audio and transcribing it are
both slow — so the HTTP API hands back an id immediately and the caller polls.

This store is deliberately in-memory and single-instance. It is the right size
for the load a recipe import puts on a single Cloud Run container, and it has
one consequence worth stating plainly: **jobs do not survive a restart, and a
second instance cannot see the first one's jobs.** Run this service with a
single instance, or move the store to Postgres or Redis behind the same
interface before scaling it out. See docs/integration.md.
"""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from .config import Settings, get_settings
from .errors import ImportError_
from .models import ImportedRecipe, ImportJobView, ImportStatus
from .pipeline import import_recipe


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Job:
    def __init__(self, import_id: str, url: str, language: str, owner_user_id: str | None):
        self.import_id = import_id
        self.url = url
        self.language = language
        self.owner_user_id = owner_user_id
        self.status = ImportStatus.queued
        self.stage: str | None = None
        self.recipe: ImportedRecipe | None = None
        self.error: dict | None = None
        self.created_at = _now()
        self.updated_at = self.created_at

    def touch(self) -> None:
        self.updated_at = _now()

    def view(self) -> ImportJobView:
        return ImportJobView(
            import_id=self.import_id,
            status=self.status,
            url=self.url,
            owner_user_id=self.owner_user_id,
            created_at=self.created_at.isoformat(timespec="seconds"),
            updated_at=self.updated_at.isoformat(timespec="seconds"),
            stage=self.stage,
            recipe=self.recipe,
            error=self.error,
        )


class JobStore:
    def __init__(self, settings: Settings | None = None, runner=None):
        self._settings = settings or get_settings()
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(
            max_workers=self._settings.max_concurrent_imports,
            thread_name_prefix="hth-import",
        )
        # Injectable so tests exercise the store without touching the network.
        self._runner = runner or import_recipe

    def submit(self, url: str, language: str, owner_user_id: str | None) -> Job:
        self._evict_expired()
        job = Job(str(uuid.uuid4()), url, language, owner_user_id)
        with self._lock:
            self._jobs[job.import_id] = job
        self._pool.submit(self._run, job)
        return job

    def get(self, import_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(import_id)

    def _run(self, job: Job) -> None:
        job.status = ImportStatus.running
        job.touch()

        def on_progress(stage: str) -> None:
            job.stage = stage
            job.touch()

        try:
            job.recipe = self._runner(
                job.url,
                job.language,
                self._settings,
                on_progress,
            )
            job.status = ImportStatus.succeeded
            job.stage = "done"
        except ImportError_ as e:
            job.status = ImportStatus.failed
            job.error = e.as_dict()
        except Exception as e:  # pragma: no cover - defensive
            job.status = ImportStatus.failed
            job.error = {"code": "IMPORT_FAILED", "message": str(e)}
        finally:
            job.touch()

    def _evict_expired(self) -> None:
        cutoff = _now() - timedelta(seconds=self._settings.job_ttl_seconds)
        with self._lock:
            stale = [
                key
                for key, job in self._jobs.items()
                if job.updated_at < cutoff
                and job.status in (ImportStatus.succeeded, ImportStatus.failed)
            ]
            for key in stale:
                del self._jobs[key]

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False)
