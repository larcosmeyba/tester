"""Job bookkeeping."""

import time

from hth_transcriber.config import get_settings
from hth_transcriber.errors import NoTranscript
from hth_transcriber.jobs import JobStore
from hth_transcriber.models import ImportStatus
from hth_transcriber.normalize import normalize
from tests.test_normalize import COMPLETE


def settle(store, job, tries=50):
    for _ in range(tries):
        if job.status in (ImportStatus.succeeded, ImportStatus.failed):
            return job
        time.sleep(0.02)
    raise AssertionError("job never settled")


def test_a_job_reports_its_stages(bundle):
    seen = []

    def runner(url, language, settings, on_progress=None):
        for stage in ("fetching_transcript", "extracting_recipe"):
            on_progress(stage)
            seen.append(stage)
        return normalize(COMPLETE, bundle)

    store = JobStore(get_settings(), runner=runner)
    job = settle(store, store.submit("https://youtu.be/a", "english", "user_1"))

    assert job.status == ImportStatus.succeeded
    assert seen == ["fetching_transcript", "extracting_recipe"]
    assert job.stage == "done"
    store.shutdown()


def test_named_failures_survive_to_the_view(bundle):
    def runner(*args, **kwargs):
        raise NoTranscript("Nothing to read.")

    store = JobStore(get_settings(), runner=runner)
    job = settle(store, store.submit("https://youtu.be/a", "english", None))

    assert job.view().error["code"] == "NO_TRANSCRIPT"
    store.shutdown()


def test_unexpected_failures_do_not_escape(bundle):
    def runner(*args, **kwargs):
        raise RuntimeError("boom")

    store = JobStore(get_settings(), runner=runner)
    job = settle(store, store.submit("https://youtu.be/a", "english", None))

    assert job.status == ImportStatus.failed
    assert job.view().error["code"] == "IMPORT_FAILED"
    store.shutdown()


def test_the_owner_travels_with_the_job(bundle):
    store = JobStore(
        get_settings(), runner=lambda *a, **k: normalize(COMPLETE, bundle)
    )
    job = store.submit("https://youtu.be/a", "english", "user_42")

    assert job.view().owner_user_id == "user_42"
    store.shutdown()
