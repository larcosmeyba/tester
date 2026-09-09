.PHONY: install dev test lint serve docker-build docker-run

install:
	uv sync

test:
	uv run pytest -q

serve:
	uv run uvicorn hth_transcriber.api:app --reload --port 8090

# One-off import from the command line, for eyeballing an extraction.
# usage: make extract URL="https://youtu.be/..."
extract:
	uv run hth-transcribe "$(URL)" -f markdown

docker-build:
	docker build -t hth-transcriber:dev .

docker-run:
	docker run --rm -p 8090:8090 --env-file .env hth-transcriber:dev
