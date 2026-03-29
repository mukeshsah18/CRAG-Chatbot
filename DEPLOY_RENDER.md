# Render Free Deployment Guide (CRAG IOE Chatbot)

This guide deploys your existing app (`app.py`) on Render Free.

## 1. Push project to GitHub

Run these commands from your project root:

```powershell
git add app.py render.yaml requirements-render.txt frontend backend
git commit -m "Add Render free deployment setup"
git push origin main
```

If your default branch is not `main`, push your active branch.

## 2. Create the Render service

1. Open Render dashboard.
2. Click **New +** -> **Blueprint**.
3. Select your GitHub repo.
4. Render will detect `render.yaml` automatically.
5. Confirm service name and region.
6. Click **Apply**.

## 3. Add required environment variable

In Render service settings, add:

- `GROQ_API_KEY` = your Groq API key

`PYTHON_VERSION` is already set in `render.yaml`.

## 4. Build and start behavior

Configured in `render.yaml`:

- Build command:
  - `pip install -r requirements-render.txt && python backend/ingest.py`
- Start command:
  - `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Health check path:
  - `/healthz`

## 5. Verify after deploy

Open your Render URL:

- `https://<your-service>.onrender.com/` -> frontend should load
- `https://<your-service>.onrender.com/healthz` -> should return `{"status":"ok"}`

## 6. Free-tier notes

- Free web services can sleep when idle.
- First request after idle can be slow.
- Free services do not support persistent disks.

For this reason, the build step regenerates `chroma_db` from `syllabus.pdf` on each deploy.

## 7. Troubleshooting

- Build fails during dependencies:
  - Retry once (temporary network issue is common).
- Build fails on ingestion:
  - Ensure `syllabus.pdf` exists in repo root.
- Runtime returns model/API errors:
  - Recheck `GROQ_API_KEY` value.
