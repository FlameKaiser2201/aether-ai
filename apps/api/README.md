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
root `.env.example`. The service runs without a valid AI key in labelled local
fallback mode, and without Redis by falling back to an in-process
limiter/cache. Add `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`,
or `GROQ_API_KEY` to use live models automatically. Inspect
`GET /api/v1/health/providers` after startup to confirm the selected provider
and model.
