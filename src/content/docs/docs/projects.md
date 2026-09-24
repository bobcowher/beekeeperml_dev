---
title: Projects
description: Creating, configuring, and managing BeekeeperML projects.
---

## Creating a Project

From the dashboard, click **+ New Project** and fill in:

| Field | Description | Default |
|-------|-------------|---------|
| Project Name | No spaces, used as the directory name | — |
| Git URL | HTTPS URL for a public repo, or an SSH URL (`git@github.com:you/repo.git`) for a private one — see [SSH Key](#ssh-key-for-private-repositories) | — |
| Branch | Git branch to clone and pull before each run | `main` |
| Python Version | Detected from system and conda | auto |
| Environment Type | venv or conda | `venv` |
| Training Script | Python file to execute when training starts | `train.py` |
| Tensorboard Log Dir | Where your script writes TB event files | `runs` |
| Requirements File | Pip requirements file installed at setup and before each run | `requirements.txt` |
| Setup Script | Optional shell script run at setup and before each training run | — |
| Data Dir (local) | Local path in the repo to symlink to your data volume | `data` |
| Data Dir (system) | Absolute path on the server to a persistent data volume | — |
| Output Paths to Save | Workspace-relative directories to preserve in persistent storage across workspace cleanups | — |
| Environment Variables | Key-value pairs passed to the training process (optional — can also be added later via Edit) | — |

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
- Output paths to save
- Environment variables
- Parallel runs settings
- GPU memory management

Git URL, Python version, and environment type are fixed after creation. Use the **Rename Project** card at the bottom of the Edit page to change the name — run history moves with it. Rename is blocked while setup or training is active.

## Environment Variables

Training scripts often need environment variables — API keys, config flags, hyperparameters. Add key-value pairs when creating the project, or click **Edit** on the project info card later. These are passed to the training process at startup.

## SSH Key for Private Repositories

BeekeeperML generates its own SSH keypair (ed25519, no passphrase) the first time it starts. Every Git clone and fetch uses it, so a private repository works once the public key is registered with GitHub.

1. Open **Admin → SSH Key** and copy the public key.
2. In GitHub, add it under **Settings → SSH and GPG keys** (account-wide access), or as a **Deploy key** on a single repository.
3. Create the project with an SSH-form URL such as `git@github.com:you/repo.git`.

If setup fails with `Permission denied (publickey)`, the project page links straight to the key. **Regenerate** on the same page replaces the keypair — add the new public key to GitHub afterward, since projects using the old key will fail to clone or fetch until you do.

Hosts you haven't connected to before are trusted on first contact. A host whose key later changes is still rejected.

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

Leave the system path blank if you don't need this feature. The data directory can also be set on an existing project through the Edit page, the API (`PATCH /api/v1/projects/<name>`), or the MCP `update_project` tool; the symlink is created immediately if the workspace already exists.

## GPU Memory Management

Opt-in per project, under **Edit → GPU Memory Management**. When enabled, BeekeeperML checks free VRAM before each run and picks the GPU with the most free memory.

| Field | Purpose |
|-------|---------|
| Minimum (MB) | Hard floor. The run is rejected if the best GPU has less free VRAM than this. `0` disables the check. |
| Preferred (MB) | Full allocation including memory your script can offload (replay buffers, for example). |

These variables are injected into the training process:

| Variable | Value |
|----------|-------|
| `CUDA_VISIBLE_DEVICES` | Index of the selected GPU, so your script always sees it as `cuda:0` |
| `CUDA_DEVICE_ORDER` | Always `PCI_BUS_ID`, so the index matches `nvidia-smi` |
| `GPU_DEVICE` | `cuda:0` — use it directly with `torch.device()` |
| `GPU_MEMORY_FREE` | MB free on the selected GPU at launch |
| `GPU_MEMORY_MINIMUM` / `GPU_MEMORY_PREFERRED` | Copied from the project settings |
| `GPU_OFFLOAD` | `1` if free VRAM is below preferred, otherwise `0` |

A typical script pattern:

```python
buffer_device = "cpu" if os.environ.get("GPU_OFFLOAD") == "1" else "cuda"
```

These variables are reserved while GPU management is on — a project environment variable with the same name is overridden.

## Saved Outputs

When parallel runs are enabled, each run gets a fresh workspace clone. The **Output Paths to Save** field lets you list workspace-relative directories (one per line) that are symlinked into durable storage outside the disposable workspace.

Each run gets its own directory under `projects/<name>/persistent/runs/run_<id>/`. Symlinks are created before training starts, so your script writes to the normal path and the files persist automatically.

TensorBoard logs are handled separately — no need to list them here.

BeekeeperML injects two environment variables into every training process:

| Variable | Value |
|----------|-------|
| `BEEKEEPER_RUN_DIR` | Absolute path to this run's persistent directory |
| `BEEKEEPER_TENSORBOARD_DIR` | Absolute path to this run's TB log directory |

You can read these directly in your training script for explicit control over where files land.

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
