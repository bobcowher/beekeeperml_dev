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
| Delete project | DELETE | `/api/v1/projects/<name>` |
| Retry setup | POST | `/api/v1/projects/<name>/setup/retry` |
| Start training | POST | `/api/v1/projects/<name>/training/start` |
| Stop training | POST | `/api/v1/projects/<name>/training/stop` |
| Check status | GET | `/api/v1/projects/<name>/training/status` |
| Get logs | GET | `/api/v1/projects/<name>/logs?tail=100` |
| Episode analysis | GET | `/api/v1/projects/<name>/logs/analysis` |
| Get metrics | GET | `/api/v1/projects/<name>/tensorboard/latest` |
| Run history | GET | `/api/v1/projects/<name>/runs` |
| List branches | GET | `/api/v1/projects/<name>/branches` |
| Switch branch | POST | `/api/v1/projects/<name>/branch` |
| List files | GET | `/api/v1/projects/<name>/files` |
| Download file | GET | `/api/v1/projects/<name>/files/<path>` |
| Busy check | GET | `/api/v1/busy` |
| System stats | GET | `/api/v1/stats` |

## Starting a Training Run

The `/training/start` endpoint accepts an optional `branch` parameter to override the project's default branch:

```bash
curl -X POST http://your-server:5000/api/v1/projects/my-project/training/start \
     -H 'Content-Type: application/json' \
     -d '{"branch": "experiment/new-arch"}'
```

## Training Status

The `/training/status` response includes a `runs` array, one entry per active run:

```json
{
  "success": true,
  "data": {
    "runs": [
      {"run_id": 42, "branch": "main", "status": "running", "pid": 12345, "elapsed": 183.4}
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

## Authentication

If auth is enabled, pass your API key as a header:

```bash
curl -H 'X-API-Key: your-api-key' http://your-server:5000/api/v1/projects
```

Generate and manage API keys from the Admin panel.
