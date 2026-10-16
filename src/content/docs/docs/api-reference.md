---
title: API Reference
description: REST API for programmatic control of BeekeeperML projects.
---

All endpoints return JSON with a consistent format:

```json
{"success": true, "data": {...}}
{"success": false, "error": {"code": "...", "message": "..."}}
```

Full interactive reference: `http://your-server:5000/api/v1/docs`

## Endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| Version | GET | `/api/v1/version` |
| List projects | GET | `/api/v1/projects` |
| Create project | POST | `/api/v1/projects` |
| Project detail | GET | `/api/v1/projects/<name>` |
| Update settings | PATCH | `/api/v1/projects/<name>` |
| Rename project | POST | `/api/v1/projects/<name>/rename` |
| Delete project | DELETE | `/api/v1/projects/<name>` |
| Retry setup | POST | `/api/v1/projects/<name>/setup/retry` |
| Start or queue training | POST | `/api/v1/projects/<name>/training/start` |
| Stop training | POST | `/api/v1/projects/<name>/training/stop` |
| Check status | GET | `/api/v1/projects/<name>/training/status` |
| List run queue | GET | `/api/v1/projects/<name>/queue` |
| Cancel queued run | DELETE | `/api/v1/projects/<name>/queue/<queue_id>` |
| Get logs | GET | `/api/v1/projects/<name>/logs?tail=100` |
| Episode analysis | GET | `/api/v1/projects/<name>/logs/analysis` |
| Get metrics | GET | `/api/v1/projects/<name>/tensorboard/latest` |
| Run history | GET | `/api/v1/projects/<name>/runs` |
| List branches | GET | `/api/v1/projects/<name>/branches` |
| Switch branch | POST | `/api/v1/projects/<name>/branch` |
| Run artifacts | GET | `/api/v1/projects/<name>/runs/<run_id\|latest>/files` |
| List files | GET | `/api/v1/projects/<name>/files` |
| Download file | GET | `/api/v1/projects/<name>/files/<path>` |
| Busy check | GET | `/api/v1/busy` |
| System stats | GET | `/api/v1/stats` |
| Capacity | GET | `/api/v1/capacity` |
| List folders | GET | `/api/v1/folders` |
| Rename folder | POST | `/api/v1/folders/<folder>/rename` |

Pipeline endpoints are listed [further down](#pipelines).

## Starting a Training Run

The `/training/start` endpoint accepts an optional `branch` parameter to override the project's default branch:

```bash
curl -X POST http://your-server:5000/api/v1/projects/my-project/training/start \
     -H 'Content-Type: application/json' \
     -d '{"branch": "experiment/new-arch"}'
```

It also takes `env_vars`, a map of extra environment variables for just this run, and `queue`. With `"queue": true`, the run goes into the project's [run queue](/docs/training/#run-queue) instead of starting now, and you get back a `202` with its `queue_id` and position:

```bash
curl -X POST http://your-server:5000/api/v1/projects/my-project/training/start \
     -H 'Content-Type: application/json' \
     -d '{"branch": "main", "env_vars": {"LR": "0.0003"}, "queue": true}'
```

A branch name that isn't valid is refused with `INVALID_BRANCH`. The rules are on the [Training](/docs/training/#running-training) page.

## Run IDs

`run_id` is the project's own run number, so `mnist` and `chess` each have a run 1. Run objects also carry a `run_ref`, like `mnist-12`, for when you need a name that's unique across the server. The internal database ID isn't exposed anymore. If you have scripts written against v1.1.0 or earlier, where IDs counted across the whole server, they'll need updating.

## Training Status

The `/training/status` response includes a `runs` array, one entry per active run:

```json
{
  "success": true,
  "data": {
    "runs": [
      {"run_id": 12, "run_ref": "my-project-12", "branch": "main", "status": "running", "pid": 12345, "elapsed": 183.4}
    ]
  }
}
```

## TensorBoard Metrics Analysis

The `/tensorboard/latest` endpoint analyzes your training metrics and returns insights:

```bash
curl http://your-server:5000/api/v1/projects/my-project/tensorboard/latest?detail=medium
```

**Which run is analyzed?**
- If training is running, it analyzes the **current active run**
- If training is idle, it analyzes the **most recent completed run**
- The response includes `is_active: true/false` to indicate which

**To compare with past runs:**

```bash
# List all runs
curl http://your-server:5000/api/v1/projects/my-project/runs

# Get metrics for a specific past run
curl http://your-server:5000/api/v1/projects/my-project/runs/3/metrics
```

### Response Fields

| Field | Description |
|-------|-------------|
| `trend` | Overall direction: `improving`, `stable`, `worsening`, or `unstable` |
| `recent_trend` | Trend of the last 20% of steps — computed on EMA-smoothed values |
| `late_slope_pct` | Slope of the last 20% of training, normalized as % of total metric range |
| `peak_value` | Best smoothed value reached during the run |
| `peak_step` | Step at which the smoothed peak occurred |
| `peak_reversal_pct` | How far the metric has moved away from its peak, as % of total range |
| `smoothed_final_value` | EMA-smoothed value at the end of the run |
| `converged` | Boolean — has the metric stabilized? |
| `anomalies` | Array of unusual spikes or drops |
| `summary` | Human-readable interpretation |

### Detail Levels

Use `?detail=low|medium|high`:

- `low` (default) — summary stats only
- `medium` — adds `smoothed_points`: ~100 EMA-smoothed data points for plotting or trend interpretation
- `high` — also adds raw sampled points

Peak detection uses EMA smoothing (alpha=0.9), matching TensorBoard's heavy smoothing setting. `peak_reversal_pct > 50` on a reward metric is a reliable signal that the model peaked and has meaningfully regressed.

## Episode Analysis (Log-Based)

The `/logs/analysis` endpoint parses episode data directly from training logs — useful when TensorBoard isn't configured:

```bash
curl http://your-server:5000/api/v1/projects/my-project/logs/analysis
```

Returns trend analysis, quartile breakdown, and recent averages for episode rewards.

## Run Queue

`GET /projects/<name>/queue` lists the runs waiting for that project, in the order they'll start:

```json
{
  "success": true,
  "data": {
    "queue": [
      {"queue_id": 7, "position": 1, "branch": "main", "env_vars": {"LR": "0.0003"},
       "source": "manual", "wait_reason": "At capacity (2 parallel runs)", "created_at": "..."}
    ]
  }
}
```

`wait_reason` says why the run hasn't started yet, if there's a reason. `source` is `manual` for runs you queued, or names the pipeline run that queued it, like `pipeline:chess-factory#3`.

`DELETE /projects/<name>/queue/<queue_id>` takes a run out of the queue. Once it's started, that returns `409` with `NOT_QUEUED`, and you'll need to stop it like any other run.

## Pipelines

See [Pipelines](/docs/pipelines/) for how they work and what the YAML looks like.

| Action | Method | Endpoint |
|--------|--------|----------|
| List pipelines | GET | `/api/v1/pipelines?folder=<folder>` |
| Create pipeline | POST | `/api/v1/pipelines` |
| Validate without saving | POST | `/api/v1/pipelines/validate` |
| Get pipeline | GET | `/api/v1/pipelines/<name>` |
| Replace pipeline | PUT | `/api/v1/pipelines/<name>` |
| Delete pipeline | DELETE | `/api/v1/pipelines/<name>` |
| Start a run | POST | `/api/v1/pipelines/<name>/runs` |
| List runs | GET | `/api/v1/pipelines/<name>/runs?limit=20` |
| Latest started run | GET | `/api/v1/pipelines/<name>/runs/latest` |
| Run detail | GET | `/api/v1/pipelines/<name>/runs/<run_id>` |
| Cancel a run | POST | `/api/v1/pipelines/<name>/runs/<run_id>/cancel` |
| Resume or re-run | POST | `/api/v1/pipelines/<name>/runs/<run_id>/resume` |
| Skip and continue | POST | `/api/v1/pipelines/<name>/runs/<run_id>/dismiss` |
| Task step log | GET | `/api/v1/pipelines/<name>/runs/<run_id>/steps/<step>/log?tail=500` |

Create, validate and replace take either YAML or JSON. Send YAML with `Content-Type: application/yaml` and the file is saved exactly as you wrote it, comments and all:

```bash
curl -X POST http://your-server:5000/api/v1/pipelines \
     -H 'Content-Type: application/yaml' \
     --data-binary @chess-factory.yaml
```

Use `--data-binary` rather than `-d` there. `-d` strips the newlines, and YAML needs them.

An invalid definition comes back as `400` with `INVALID_PIPELINE`, and `error.details.errors` lists every problem with the field it's about:

```json
{"path": "steps[1].env_vars.EPOCHS", "message": "must be a string, got int 3; quote it in YAML"}
```

To start a run with different branches, pass a map of train step names to branches. Steps you leave out use the branch in the definition:

```bash
curl -X POST http://your-server:5000/api/v1/pipelines/chess-factory/runs \
     -H 'Content-Type: application/json' \
     -d '{"branches": {"fine-tune": "experiment/lower-lr"}}'
```

If the pipeline is already running, the new run is queued, and the response has `"status": "queued"` and its `position`.

`resume` with no body picks up a failed or cancelled run at the step that stopped it. To re-run from an earlier step, including on a run that succeeded, pass `{"from_step": "fine-tune"}`. Only the latest run of a pipeline can be resumed.

`runs/latest` skips runs that are still queued, so it always describes a run that actually started.

## Folders

`GET /folders` returns every folder name in use. To rename one:

```bash
curl -X POST http://your-server:5000/api/v1/folders/chess/rename \
     -H 'Content-Type: application/json' \
     -d '{"new_name": "chess-v2"}'
```

That moves every project and pipeline in `chess` to `chess-v2`. `GET /projects` and `GET /pipelines` both take `?folder=<name>` to filter, and an empty `?folder=` gives you the unfiled ones.

## Error Codes

| Code | Status | When |
|------|--------|------|
| `PROJECT_BUSY` | 409 | Deleting a project while one of its runs is starting or running. This replaced `TRAINING_RUNNING`. |
| `INVALID_BRANCH` | 400 | A branch name that fails validation |
| `INVALID_PIPELINE` | 400 | A pipeline definition that fails validation |
| `TASKS_DISABLED` | 403 | Starting a pipeline with a task step when an admin has turned task steps off |
| `PIPELINE_ACTIVE` | 409 | Deleting or resuming a pipeline that has a run going |
| `ARTIFACTS_MISSING` | 409 | Resuming when an earlier step's output folder is gone |
| `NOT_LATEST` | 409 | Resuming or dismissing a run that isn't the pipeline's latest |

## Cross-Site Requests

Beekeeper refuses a `POST`, `PUT`, `PATCH` or `DELETE` with a `403` when its `Origin` or `Referer` header names a different host than the one the request was sent to. That stops some other web page you have open from quietly creating projects or running pipeline tasks on your server through your browser.

curl, the MCP server and your own scripts don't send those headers, so they aren't affected.

If you run Beekeeper behind a reverse proxy, make sure the proxy passes the original `Host` header through. Otherwise Beekeeper sees the proxy's upstream address as the host, and every button in the UI that changes something gets a `403`. For nginx, that's:

```nginx
proxy_set_header Host $host;
```

## Authentication

If auth is enabled, send your API key as a bearer token:

```bash
curl -H 'Authorization: Bearer your-api-key' http://your-server:5000/api/v1/projects
```

Generate and manage API keys from the Admin panel.
