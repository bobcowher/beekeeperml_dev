---
title: Getting Started
description: Install BeekeeperML on your home lab server in minutes.
---

## Requirements

- Python 3.10+
- Git
- Linux server with systemd (tested on Ubuntu)
- GPU optional but recommended

## Installation

Clone the repo and run the setup script. It creates a virtual environment, installs dependencies, and registers a systemd service.

```bash
git clone https://github.com/bobcowher/beekeeper.git
cd beekeeper
bash setup.sh
```

The setup script will:

1. Detect your Python version (3.12, 3.11, 3.10, or python3)
2. Create a venv and install dependencies
3. Generate and install a systemd service file (requires sudo)
4. Enable and start the service

Once complete, BeekeeperML is running on port 5000. Open `http://your-server:5000` in a browser.

## Managing the Service

```bash
# Check status
sudo systemctl status beekeeper

# View logs
journalctl -u beekeeper -f

# Restart
sudo systemctl restart beekeeper

# Stop
sudo systemctl stop beekeeper
```

## Development Mode

To run without systemd for development or testing:

```bash
cd beekeeper
source venv/bin/activate
python app.py
```

This runs Flask's development server on port 5000 with auto-reload.

## Connect an AI Agent (MCP)

Install the MCP server:

```bash
pip install beekeeper-mcp
```

Register it with Claude Code:

```bash
claude mcp add beekeeper -s user \
  -e BEEKEEPER_HOST=http://your-server:5000 \
  -- beekeeper-mcp
```

If auth is enabled on your server, add `-e BEEKEEPER_API_KEY=your-key` before `--`.

See [MCP Server](/docs/mcp-server/) for full setup details.

## Current Limitations

- **GitHub auth** — BeekeeperML has no method of authenticating with private repos. It only works with public repositories.
- **HTTPS** — For HTTPS, put BeekeeperML behind a reverse proxy. It's not ready to handle anything sensitive without one.
- **Multi-server** — Single-server product. A central Hive managing multiple workers is planned for the future.

Authentication (login, sessions, API keys, user management) is implemented and available in the admin panel. It's off by default for home lab use — enable it if your server is exposed beyond your local network.
