---
title: Projects
description: Creating, configuring, and managing BeekeeperML projects.
---

## Creating a Project

From the dashboard, click **+ New Project** and fill in:

| Field | Description | Default |
|-------|-------------|---------|
| Project Name | No spaces, used as the directory name | — |
| Git URL | Public Git repository URL | — |
| Branch | Git branch to clone and pull before each run | `main` |
| Python Version | Detected from system and conda | auto |
| Environment Type | venv or conda | `venv` |
| Training Script | Python file to execute when training starts | `train.py` |
| Tensorboard Log Dir | Where your script writes TB event files | `runs` |
| Requirements File | Pip requirements file installed at setup and before each run | `requirements.txt` |
| Setup Script | Optional shell script run at setup and before each training run | — |
| Data Dir (local) | Local path in the repo to symlink to your data volume | `data` |
| Data Dir (system) | Absolute path on the server to a persistent data volume | — |

Every field has a tooltip — hover the **?** icon for a description.

Once you submit, BeekeeperML runs the following in the background:

1. **Git clone** — clones the repository at the specified branch into a `workspace/` directory
2. **Create environment** — creates a venv or conda env with the selected Python version
3. **Data dir symlink** — if enabled, creates a symlink from `workspace/<local path>` to the system data directory
4. **Setup script** — if configured and the file exists, runs it from the workspace root
5. **Pip install** — installs packages from the requirements file

The project page refreshes automatically and shows the current step. If any step fails, the error is displayed and a **Retry Setup** button appears. Retry is smart — it skips the clone and environment creation if they already completed, and picks up from the failed step.

## Editing Project Settings

Click **Edit** on the project page to change:

- Git branch
- Training script path
- Tensorboard log directory
- Requirements file
- Setup script
- Data directory (local and system paths)
- Environment variables
- Parallel runs settings

Name, Git URL, Python version, and environment type are fixed after creation.

## Environment Variables

Training scripts often need environment variables — API keys, config flags, hyperparameters. Click **Edit** on the project info card to add key-value pairs. These are passed to the training process at startup.

## Setup Script

If your project needs system-level setup beyond pip — downloading a dataset, linking shared weights, generating config files — you can point BeekeeperML at a shell script.

```bash
# example setup.sh (place this in your repo root)
#!/bin/bash
set -e

mkdir -p data

if [ ! -f data/iris.csv ]; then
    echo "Downloading dataset..."
    curl -fsSL https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv \
         -o data/iris.csv
fi
```

Set **Setup Script** to `setup.sh` (or your script's name) when creating or editing a project. BeekeeperML will run it from the repository root:

- Once during initial project setup (after the environment is created, before pip install)
- Again before every training run (after git pull, before pip install)

The script is silently skipped if the file doesn't exist.

## Data Directory

For projects that need access to a large persistent dataset stored elsewhere on the server — a mounted NAS share, a shared `/data` volume, or any local path — use the Data Directory fields.

| Field | Purpose |
|-------|---------|
| Data Dir (local) | Path within the repo to create as a symlink (default: `data`) |
| Data Dir (system) | Absolute path on the server to link to |

BeekeeperML creates a symlink at `workspace/<local>` → `<system path>` during project setup, and ensures it exists again before each training run. Your training script just reads from `data/` as if the dataset lived inside the repo.

Leave the system path blank if you don't need this feature.

## Viewing and Downloading Files

Expand the **Files** section on the project page to browse the project's workspace directory. You can preview files inline, download individual files, or download entire directories as zip archives.

### Inline Viewer

Click any viewable filename or the **view** button to open it in a modal without leaving the page.

| File type | Extensions | Behavior |
|-----------|------------|----------|
| Images | png, jpg, jpeg, gif, webp, svg, bmp, ico | Rendered inline. **Auto-refreshes every 2 seconds** — useful for monitoring debug images written during training. |
| Text / code | py, log, json, yaml, md, sh, csv, toml, js, ts, html, xml, and more | Displayed in a monospace viewer. Files over 1 MB fall back to download. |

Close the viewer with the **×** button, by clicking the backdrop, or by pressing Escape.

### Using curl

The same endpoints that power the UI work with curl:

```bash
# List files in the project root
curl http://your-server:5000/projects/my-project/files/

# Download a specific file
curl -O http://your-server:5000/projects/my-project/files/checkpoints/model.pt

# Download a directory as a zip
curl -o checkpoints.zip 'http://your-server:5000/projects/my-project/files/checkpoints/?zip=1'
```

## Organizing Projects

### Sort Order

A toggle in the Projects header switches between:

- **Last Run** (default) — projects you've trained most recently float to the top
- **A–Z** — alphabetical order

Your preference is saved in the browser and remembered across sessions.

### Pinning

Click the 📌 icon on any project row to pin it. Pinned projects always appear above the sorted list, regardless of sort order. Click again to unpin. Pin state is saved on the server.
