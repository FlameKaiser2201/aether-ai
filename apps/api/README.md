# AETHER API

FastAPI service for the AETHER voice-first AI workspace.

```bash
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"    # Windows
# .venv/bin/pip install -e ".[dev]"      # macOS/Linux
uvicorn app.main:app --reload --port 8000
```

The interactive API reference is available at `http://localhost:8000/docs` when
`ENABLE_API_DOCS=true` (the default outside production).

Configuration lives in `.env`; every variable is documented in the repository
root `.env.example`. The service runs without any AI key in offline demo mode,
and without Redis by falling back to an in-process limiter/cache.
