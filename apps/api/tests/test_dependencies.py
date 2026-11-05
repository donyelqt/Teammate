"""Dependency audit: every declared dependency must be importable.

Reads ``pyproject.toml`` and asserts each dependency can be imported
in the host environment. Fails loudly if any import raises
``ImportError`` or ``ModuleNotFoundError`` — this catches C-extension
packages that won't run inside the Cloudflare Workers Pyodide runtime.
"""

from __future__ import annotations

import importlib
import sys
import tomllib
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Modules that exist only inside the Cloudflare Workers Pyodide runtime
# and must be mocked in a host venv.
_PYODIDE_MOCKS = ("js", "_pyodide_entrypoint_helper",
                  "_cloudflare_compat_flags")


@pytest.fixture(autouse=True, scope="module")
def _mock_pyodide_modules() -> Generator[None]:
    saved = {k: sys.modules.get(k) for k in _PYODIDE_MOCKS}
    for name in saved:
        sys.modules[name] = MagicMock()
    try:
        yield
    finally:
        for name, original in saved.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def _parse_pyproject_dependencies() -> list[str]:
    """Return the list of dependency names from ``pyproject.toml``."""
    pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    with open(pyproject, "rb") as f:
        data = tomllib.load(f)
    return list(data["project"]["dependencies"])


def _import_name(dist_name: str) -> str:
    """Map a distribution name to its import name."""
    mapping = {
        "workers-py": "workers",
        "workers-runtime-sdk": "workers",
        "python-ulid": "ulid",
        "PyJWT": "jwt",
    }
    if dist_name in mapping:
        return mapping[dist_name]
    return dist_name.replace("-", "_").lower()


@pytest.mark.parametrize("dep", _parse_pyproject_dependencies())
def test_dependency_importable(dep: str) -> None:
    import_name = _import_name(dep)
    importlib.import_module(import_name)