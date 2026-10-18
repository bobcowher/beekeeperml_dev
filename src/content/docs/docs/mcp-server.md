---
title: MCP Server
description: Connect AI agents to BeekeeperML via the Model Context Protocol.
---

BeekeeperML ships a Model Context Protocol (MCP) server that lets AI agents — Claude Code, Claude Desktop, or any MCP-compatible client — control training jobs directly without copy-pasting curl commands.

## Install

```bash
pip install beekeeper-mcp
```

Or run it directly from the repo without installing:

```bash
cd /path/to/beekeeper
source venv/bin/activate
python -m beekeeper_mcp
```

## Register with Claude Code

Run this once in your terminal:

```bash
claude mcp add beekeeper -s user \
  -e BEEKEEPER_HOST=http://your-server:5000 \
  -- beekeeper-mcp
```

If auth is enabled, add `-e BEEKEEPER_API_KEY=your-api-key` before `--`.

If `beekeeper-mcp` isn't on your PATH after install, use the full path from `which beekeeper-mcp`.

## Register with Claude Desktop

Add this to `claude_desktop_config.json`. On macOS it lives in `~/Library/Application Support/Claude/`, and on Windows it's in `%APPDATA%\Claude\`. You can also get to it from Claude Desktop under Settings, then Developer, then Edit Config.

```json
{
  "mcpServers": {
    "beekeeper": {
      "command": "beekeeper-mcp",
      "env": {
        "BEEKEEPER_HOST": "http://your-server:5000",
        "BEEKEEPER_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Upgrading

The server and the MCP package are versioned separately. This release of BeekeeperML needs `beekeeper-mcp` 0.8.0 or newer. An older version will still connect, but before 0.8.0 it can't keep pipeline runs or mark runs notable, before 0.7.0 it doesn't know about `script`, `inherit` and project tasks in pipelines and has no `build_local_env`, before 0.6.0 it has no Runpod tools, and before 0.5.0 it's also missing the pipeline, folder and queue tools and doesn't know about the changes to run IDs and the busy check. Upgrade with:

```bash
pip install -U beekeeper-mcp
```

The `get_version` tool tells you if you're behind. It's a good idea to have your agent call it at the start of a session.

## Available Tools

### Projects

| Tool | Description |
|------|-------------|
| `get_version` | Check MCP/server version compatibility. Call this at session start. |
| `list_projects` | List projects and their status. Takes an optional `folder` to filter on. |
| `get_project` | Full project detail including current run state |
| `get_project_instructions` | Per-project agent instructions (goals, metrics, notes) |
| `create_project` | Create a project, with optional `output_paths`, `folder`, `setup_script` and `compute_target` |
| `update_project` | Update project settings: branch, train file, TB dir, env vars, data directory, GPU management, folder, and so on. `output_paths_add` adds output paths. |
| `rename_project` | Rename a project. Run history moves with it. |
| `delete_project` | Delete a project. Refused while one of its runs is starting or running. |
| `retry_setup` | Retry a failed project setup |
| `build_local_env` | Build a project's environment on the server, so a Runpod project can run [project tasks](/docs/pipelines/#project-tasks). Its training stays on Runpod. |
| `list_branches` | List remote branches for a project |
| `switch_branch` | Change the project's active branch |

### Training

| Tool | Description |
|------|-------------|
| `start_training` | Start a run, with optional `branch` and `env_vars`. Pass `queue=True` to add it to the project's run queue instead. |
| `training_status` | Current runs for a project |
| `stop_training` | Stop a specific run by ID |
| `get_logs` | Tail the log for a run |
| `analyze_run` | Synthesized analysis of a run: TensorBoard metrics plus a log tail |
| `set_run_notable` | Mark a run notable so history pruning never deletes it, or clear the mark |
| `list_queue` | Runs waiting in a project's queue, in start order, with the reason each is waiting |
| `cancel_queued_run` | Take a run out of the queue before it starts |

### Pipelines

| Tool | Description |
|------|-------------|
| `list_pipelines` | List pipelines with their latest run. Takes an optional `folder`. |
| `get_pipeline` | A pipeline's definition, parsed and as raw YAML |
| `validate_pipeline` | Check pipeline YAML without saving it. Errors that one call would fix include a `fix` naming that call. |
| `create_pipeline` | Create a pipeline from YAML |
| `update_pipeline` | Replace a pipeline's YAML. Runs already going keep the definition they started with. |
| `delete_pipeline` | Delete a pipeline and its run history. The training runs it started are kept. |
| `start_pipeline` | Start a run, or queue it if one is already going. `branches` maps train step names to branches. |
| `pipeline_status` | Status of a run, step by step, with training run refs, wait reasons and errors. Without `run_id` you get the latest run that started. |
| `list_pipeline_runs` | Recent runs of a pipeline, newest first |
| `cancel_pipeline` | Cancel a run and stop its current step |
| `resume_pipeline` | Resume a failed or cancelled run, or pass `from_step` to re-run from an earlier step |
| `dismiss_pipeline_run` | Skip a failed run so the next queued run can start |
| `keep_pipeline_run` | Keep a run, so the runs its steps made are never pruned, or pass `keep=False` to release it. See [Keeping Runs](/docs/pipelines/#keeping-runs). |
| `get_step_log` | Log of a task step. For a train step or a project task, use `get_logs` with the step's run ID. |

When validation offers a fix, like adding an output path with `update_project(output_paths_add=[...])` or calling `build_local_env`, the tool descriptions tell the agent to check with you first. Adding an output path changes every run of that project, not just the pipeline's.

### Folders

| Tool | Description |
|------|-------------|
| `list_folders` | Folder names in use |
| `rename_folder` | Rename a folder, moving every project and pipeline in it |

### Server

| Tool | Description |
|------|-------------|
| `get_stats` | System GPU/CPU/memory stats, plus GPU driver version and the max CUDA version it supports |
| `get_capacity` | Training slot capacity (total, running, available), resource load, and the same GPU platform info |
| `check_busy` | Whether anything is running, including project setup and pipeline task steps. Prefer `get_capacity` for new workflows. |

### Runpod

These only work when Runpod is turned on for the server. See [Runpod](/docs/cloud-providers/runpod/).

| Tool | Description |
|------|-------------|
| `get_compute_status` | Spend for each period against its caps, the burn rate, live pods and recent Runpod runs |
| `list_runpod_gpus` | GPU types with stock, VRAM and price. Use the ids in `update_project(runpod_gpu_types=...)`. |
| `terminate_pod` | Stop the run on a pod and terminate it. For an ordinary stop, `stop_training` does the same thing. |

`create_project` takes `compute_target` (and `setup_script`), and `update_project` takes `compute_target`, `runpod_gpu_types`, `runpod_image` and `data_dir_sync`. There's no tool for resetting the total spend counter. That one's in **Admin**, on purpose.

## Starting a Claude Session

Each project page has an **API → Agent** section with a ready-to-paste prompt. Paste it into Claude to orient the agent on the project:

```
You have the Beekeeper MCP server connected. Beekeeper manages ML training jobs on a remote GPU server.

Get oriented on the <project-name> project:
1. Call get_project_instructions("<project-name>") and read it fully
2. Call analyze_run("<project-name>") for current training state
3. Save key context (project name, primary metric, training goals) to your memory
4. Give me a status report: what's running, how it's performing, anything worth flagging
```

## Per-Project Agent Instructions

Each project has an **Agent Instructions** field (visible in the edit page) where you can write goals, metric targets, and notes for the agent. The `get_project_instructions` tool returns this text, giving your agent project-specific context without you having to repeat it every session.

Example instructions:

```
Primary metric: mean_episode_reward (maximize)
Target: reach 500+ reward sustained over 100 episodes
Current best: 312 on branch experiment/ppo-tuning
Avoid: touching the reward shaping code in envs/custom_env.py — it's fragile
Next experiment: try reducing entropy_coef from 0.01 to 0.001
```
