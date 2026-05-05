---
title: Training
description: Running, monitoring, and managing training runs in BeekeeperML.
---

## Running Training

Once setup completes, the **Training** section appears on the project page. A branch picker is visible immediately — select the branch you want to train from and click **Start**.

BeekeeperML runs the following sequence before launching your script:

1. **Git pull** — pulls the latest code from the selected branch
2. **Data dir symlink** — verifies or creates the symlink if a data directory is configured
3. **Setup script** — runs your setup script if configured and present
4. **Pip install** — installs/updates packages from the requirements file
5. **Launch** — starts the training script as a detached subprocess

If any step fails, training is aborted and the error is shown on the project page.

Closing the browser tab has no effect on the running process.

## Active Run List

Each active run appears as a row in the run list showing:

- **Status badge** — `starting`, `running`, `stopped`, or `crashed`
- **Branch name** and **Run ID**
- **Elapsed time**
- **Tensorboard link** — if TB started for this run
- **▶ Logs** — toggle to expand the inline log terminal for that run
- **■ Stop** — stop this specific run

Hit **■ Stop** to send SIGTERM, with a SIGKILL fallback after 5 seconds.

## Parallel Runs

By default, BeekeeperML allows one run at a time per project. To run multiple branches simultaneously, enable parallel runs in the project edit page:

| Setting | Description |
|---------|-------------|
| Parallel Runs | Enable/disable concurrent training runs for this project |
| Max Parallel Runs | Maximum number of simultaneous runs allowed |

When parallel runs are enabled, a **+ Start Run…** button appears below the active run list. Each parallel run gets its own full clone of the repository in a temporary workspace, its own log file, and its own Tensorboard instance. Completed parallel run workspaces are cleaned up automatically.

Each run is tracked by a **Run ID** — a unique integer assigned at start. The ID appears in the run row, in the log file header, and in the run history table.

## Switching Branches

The **Project Info** card has an **Active Branch** dropdown. Selecting a different branch switches the project's default branch immediately (equivalent to `git checkout` on the server). This affects the next training run's `git pull` target.

Branch switching requires no running training jobs — BeekeeperML will warn you if the workspace has uncommitted changes.

## Tensorboard

Tensorboard starts automatically when training starts and stops when training stops. It runs from the project's own environment, using whatever version of Tensorboard is in the project's requirements.

The port is allocated dynamically starting at 6006. You can:

- View it inline in the iframe on the project page
- Expand the iframe to full height
- Open it directly in a new browser tab
- Clear accumulated Tensorboard logs with the **Clear Tensorboard Logs** button

## Run History

Each project tracks its training runs. Expand the **Run History** section to see a table of past runs.

Each row shows:

- **Run ID** (`#N`) — unique identifier, matches the ID shown in the active run list and log headers
- **Started** — timestamp
- **Duration** — wall-clock time
- **Status** — `completed`, `crashed`, or `canceled`
- **Branch / Commit** — branch name and short commit SHA at the time of the run
- **Tags** — custom labels you can add
- **Actions** — Notes toggle, log download

### Starring Runs

Click the ⭐ button on any run row to star it. Starred runs:

- Are highlighted in the history table
- Are exempt from automatic pruning (they'll never be deleted by the **Cleanup Old Runs** button)
- Can be filtered by clicking **★ Starred** in the filter bar

### Tags

Click the **+** button in the Tags cell to add comma-separated tags to a run (e.g., `baseline,lr=0.01`). Tags are searchable using the filter bar above the table.

### Notes

Click **+ Notes** on any row to expand a text area for free-form post-run observations. Notes are saved automatically when you click away.

### Comparing Runs

Check the box on any two rows to enable the **Compare selected** button. The comparison modal shows both runs side by side — branch, status, commit, duration, tags, notes — plus a **git diff** between the two commits so you can see exactly what code changed between runs.

### Filtering

The filter bar above the table has two controls:

- **★ Starred** — toggle to show only starred runs
- **Filter by tag** — type to filter by tag name (partial match)

### Log Archive

If the run produced a log, a **Log** link appears in the Actions column. Logs are kept independently of the run history — archived logs persist until manually deleted.

### Pruning

The **Cleanup Old Runs** button removes old run records, keeping the most recent N runs (configurable). Starred runs are never pruned. **Clear All History** removes all run records for the project.

## Artifact Storage

BeekeeperML provides every training process with a durable storage location outside the disposable workspace. Three environment variables are injected automatically:

| Variable | Value |
|----------|-------|
| `BEEKEEPER_RUN_DIR` | Per-run persistent directory: `projects/<name>/persistent/runs/run_<id>/` |
| `BEEKEEPER_TENSORBOARD_DIR` | TB log directory inside `BEEKEEPER_RUN_DIR` |
| `TENSORBOARD_LOG_DIR` | Same as `BEEKEEPER_TENSORBOARD_DIR` (for scripts that read this convention) |

If you configured **Output Paths to Save** when creating the project, BeekeeperML creates symlinks from those workspace paths into `BEEKEEPER_RUN_DIR` before training starts — your script writes to the usual relative path and the files land in persistent storage.

For direct control, read `BEEKEEPER_RUN_DIR` in your training script and write checkpoints there explicitly.

## Notes

- Training processes are fully detached — they survive browser disconnects, but not server reboots. After a reboot, the systemd service restarts BeekeeperML, but any previously running training jobs will need to be restarted from the UI.
- BeekeeperML runs with a single Gunicorn worker (`-w 1`) because training state is tracked in memory. The setup script configures this automatically.
