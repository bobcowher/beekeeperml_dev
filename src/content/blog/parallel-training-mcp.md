---
title: "Beekeeper Update - Parallel Training + MCP"
date: 2026-05-01
description: "The MCP server and parallel training runs are live. Connect Claude or any MCP-compatible agent to your training server and run multiple branches simultaneously."
youtubeId: "k82onPCEuBc"
---

Two big features in this update: parallel training runs and the MCP server.

Parallel runs let you train multiple git branches simultaneously — each gets its own workspace, log file, and TensorBoard instance. The MCP server (`pip install beekeeper-mcp`) lets Claude and other MCP-compatible agents control your training server directly via tool calls.
