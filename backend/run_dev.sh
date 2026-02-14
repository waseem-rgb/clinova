#!/usr/bin/env bash
set -e
source .venv/bin/activate
uvicorn app.main:app --reload --port 9000 --host 0.0.0.0
