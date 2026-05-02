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
python /path/to/beekeeper/mcp_server.py
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

Add to `~/.claude/claude_desktop_config.json`:

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

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects and their status |
| `get_project` | Full project detail including current run state |
| `get_project_instructions` | Per-project agent instructions (goals, metrics, notes) |
| `training_status` | Current runs for a project |
| `start_training` | Start a run, optionally specifying a branch |
| `stop_training` | Stop a specific run by ID |
| `get_logs` | Tail the log for a run |
| `analyze_run` | Episode analysis from logs — trend, averages, quartiles |
| `get_stats` | System GPU/CPU/memory stats |
| `list_branches` | List remote branches for a project |
| `switch_branch` | Change the project's active branch |
| `check_busy` | Check if the server is busy before starting a new job |
| `create_project` | Create a new project |
| `delete_project` | Delete a project |
| `retry_setup` | Retry a failed project setup |

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
