---
title: Runpod
description: Run a project's training on a rented Runpod GPU, with spend caps and results synced back to your server.
---

A project can be set to train on [Runpod](https://www.runpod.io/) instead of your Beekeeper server. Each run rents its own pod. Beekeeper uploads the code, sets up the environment on the pod, runs training, syncs the results back into the normal run folder, and terminates the pod when the run ends.

Runpod is turned on per project. Beekeeper never moves a run to Runpod because the local GPU is busy.

## Setup

1. Go to **Admin → Compute Providers** and check **Enable Runpod**. The Runpod options don't appear anywhere else in Beekeeper until this is on.
2. Create an API key in the Runpod console and paste it into **API Key**.
3. Click **Test Connection**. If the key works, you'll see the GPU types Runpod offers, with current prices and stock. Use these exact names in a GPU list.
4. Set at least one hard spend cap (see below). Runpod runs are refused until one is set.

The API key is stored in a file on the Beekeeper server that only the Beekeeper user can read. It isn't shown again after saving and it isn't sent to pods. Leave the field blank on later saves to keep the current key.

## Spend Caps

Caps can be set for three periods:

| Period | Resets |
|--------|--------|
| Daily | Midnight, server time |
| Monthly | The 1st of the month |
| Total | When you click **Reset Total Spend** |

Each period has a soft cap and a hard cap. Any of them can be left blank.

- **Soft cap:** no new pods start. Running pods carry on. Queued Runpod runs stay in the queue with a reason like `Runpod soft cap reached ($8.12 of $8.00 today)` and start after the period resets.
- **Hard cap:** Beekeeper stops every Runpod run, does a short final sync, and terminates each pod. If the sync doesn't finish in time, the pod is terminated anyway.

If Runpod is enabled and no period has a hard cap, every Runpod run is refused.

Spend is tracked by Beekeeper from each pod's hourly price and uptime. Runpod's billing data can lag by several minutes, so it isn't used for the caps. Treat Beekeeper's numbers as an estimate and your Runpod bill as the actual cost.

Caps are only enforced while Beekeeper is running. Runpod stops your pods when your account balance reaches $0, so prepaid credits put an upper limit on spend even if Beekeeper is down.

## Project Settings

To send a new project to Runpod, set **Run training on** to **Runpod** when you create it. For an existing project, change it under **Where to Run** on the Edit page. Runpod projects get these extra settings:

| Setting | What it does |
|---------|--------------|
| GPU list | GPU types to try, in order, one per line. If empty, the list from Admin is used. If both are empty, Beekeeper picks the cheapest GPU in stock with enough memory. |
| Image | The container image the pod runs. If empty, the default from Admin is used. |
| Sync data dir on startup | Upload the project's data directory to the pod before training. See [Data](#data). |

The minimum GPU memory comes from **Minimum VRAM** under GPU Memory Management, or 16 GB if that's unset. GPUs on the list with less memory are skipped, and the run log notes which ones.

If nothing on the list is in stock, the run is refused with `NO_GPU_AVAILABLE`. **Add to Queue** retries every few seconds until a GPU is available.

Runpod projects don't build an environment on your server. Setup ends after the git clone, and the pod builds its own environment on every run. If you switch a project back to **This server**, Beekeeper builds the local environment at that point.

Conda projects aren't supported on Runpod. The pod creates a venv with the image's Python, which may not match the Python version set on the project. The run log shows the version used.

## What Happens During a Run

Runpod runs are started the same way as local ones: **Start**, **Add to Queue**, or a pipeline step. Before renting a pod, Beekeeper checks the spend caps, the upload size, and GPU stock. A run refused at this point costs nothing and doesn't use a run number.

The run row on the project page shows the GPU and the current phase:

1. **Starting pod:** Beekeeper rents the GPU and waits for the pod to accept connections. With the default image this takes 15 to 30 seconds.
2. **Uploading:** the workspace is uploaded at the branch Beekeeper has checked out. The repo isn't cloned on the pod, so private repos don't need credentials there.
3. **Installing:** the setup script runs, then a venv is created and `pip install` runs. The venv can see packages already in the image, so the default PyTorch image doesn't download torch again.
4. **Training:** the log streams back to the project page every few seconds. The run folder syncs back every **Result sync interval** (10 minutes by default, set in Admin). If a pod dies mid-run, anything written since the last sync is lost.
5. **Syncing results:** after training ends, Beekeeper does a full sync and checks that every file on the pod arrived with the same size. The pod is terminated after that check passes.

If the final check fails, the run is marked crashed, even if training exited cleanly.

A finished Runpod run has the same run ID, run folder, TensorBoard logs, and history entry as a local run. The log also includes `[beekeeper]` lines for the pod, GPU, timings, and cost:

```
[beekeeper] Runpod pod jttvknafkpwli0 (bk-021500-iris-runpod-1): NVIDIA RTX 4000 SFF Ada Generation 20 GB, $0.18/hr, community cloud, image runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04
[beekeeper] Pod reachable after 17s
...
[beekeeper] Results synced and verified
[beekeeper] Pod jttvknafkpwli0 terminated
[beekeeper] Runpod cost for this run: $0.0028 (Beekeeper's estimate)
```

The training script gets the same environment variables as a local run (`BEEKEEPER_RUN_DIR`, `BEEKEEPER_RUN_ID`, and so on), with paths on the pod. The project's environment variables are sent to the pod too, including any secrets you've put in them.

## Data

Pods can't see your server's disks, so a project's [data directory](/docs/projects/#data-directory) has to be uploaded. Check **Sync data dir on startup** to upload it before training. If a project has a data directory and sync is off, Runpod runs are refused with `DATA_DIR_NOT_SYNCED`.

The pod is billed while the upload runs, so a large data directory over a slow home connection can cost more than the training. For example, 30 GB at 20 Mbps takes about three and a half hours.

The total upload per run is limited by **Max upload per run** in Admin (20 GB by default). This counts the workspace, the data directory, and any pipeline inputs. Runs over the limit are refused with `UPLOAD_TOO_LARGE`, and the message shows the size of each part.

If training only reads part of a large data directory, point the project at the subfolder it uses.

## Pipelines

Pipelines work without changes. A train step for a Runpod project runs on Runpod.

A step that uses [`inherit`](/docs/pipelines/#passing-files-between-steps) gets its inherited paths in the run folder before the pod is rented, and the run folder is uploaded with them. The script opens them by relative path, the same as on your server. Inherited paths count toward **Max upload per run**.

For a step without `inherit`, the folders behind `BEEKEEPER_STEP_<NAME>_DIR`, `BEEKEEPER_PREV_STEP_DIR` and `BEEKEEPER_PIPELINE_RUN_DIR` are uploaded to the pod, and the variables are rewritten to point at the uploaded copies. Every earlier step's folder goes up, used or not, so long pipelines upload more than `inherit` would. The pipeline run folder goes up without its `steps/` folder, which only holds copies made by tasks.

Either way, results sync back before the step is marked finished, so the next step finds them in the usual place.

Task steps always run on the Beekeeper server, project tasks included. A [project task](/docs/pipelines/#project-tasks) on a Runpod project needs the project's environment built on the server first. Validation offers to do it.

## Stopping a Run

**Stop** stops training, syncs the results, then terminates the pod, so a Runpod run takes a little longer to show as stopped than a local one.

A run is also stopped automatically when it hits **Max runtime per run** (set in Admin, counted from when the pod was rented) or when a hard cap is reached.

## Nodes Page

When Runpod is on, **Nodes** appears in the sidebar. It shows:

- spend against each cap
- the current burn rate
- each live pod with its run, GPU, phase, price, uptime, cost so far, and last sync
- a **Terminate** button per pod, which stops the run with a short final sync and deletes the pod
- daily spend for the last 30 days
- recent Runpod runs and why each one ended

The dashboard also shows a **Remote Compute** card next to System Stats with the pod count, burn rate, and spend against each cap. On the [Run History](/docs/training/#run-history-page) page, Runpod runs show their GPU and cost.

## Restarts and Lost Pods

Runpod runs survive a Beekeeper restart. On startup, Beekeeper reattaches to any pods that are still training and picks up the log where it left off, including output from while it was down. Pods that were still uploading or installing are stopped and marked "interrupted by restart". Pods that no longer exist are marked lost, and whatever was synced before then is kept.

If Beekeeper stays down, each pod terminates itself once it passes its max runtime plus **Hold for sync**. It uses the pod-scoped key Runpod gives every pod, so your account key is never on the pod.

Pods are named `bk-<id>-<project>-<run>`, where `<id>` identifies your Beekeeper install. Beekeeper periodically terminates pods with its id that don't belong to any run, once they're at least 10 minutes old. Pods without its id, including ones you started by hand or that belong to another Beekeeper on the same account, are left alone.

## MCP and API

The [MCP server](/docs/mcp-server/#runpod) has `get_compute_status`, `list_runpod_gpus`, and `terminate_pod`, and `create_project` and `update_project` accept the Runpod settings. The endpoints are in the [API reference](/docs/api-reference/#runpod).
