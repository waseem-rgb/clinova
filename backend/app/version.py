"""Service version info."""
from __future__ import annotations

import os
from typing import Dict


def get_version_info() -> Dict[str, str]:
    return {
        "name": os.getenv("CLINOVA_SERVICE_NAME", "clinova-api"),
        "version": os.getenv("CLINOVA_VERSION", "v2.0.0"),
        "environment": os.getenv("CLINOVA_ENV", "local"),
    }
