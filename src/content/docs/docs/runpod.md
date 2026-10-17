---
title: Running on Runpod
description: Send a project's training to a rented Runpod GPU, with spend caps and results synced home.
---

I only have one 3090, so I can only run one real experiment at a time. Everything else waits in line. Runpod support lets a project run its training on a rented GPU instead, so a second or third experiment doesn't have to wait for the first. It's also the way to do a full-size run once you've got the architecture right on your own hardware.

Runpod is opt-in, one project at a time. Nothing goes to Runpod because your local GPU is busy. A project either runs here or runs on Runpod, and you pick which.

Each run gets its own pod. Beekeeper uploads the code, runs the setup on the pod, trains, pulls the results back into the normal run folder, and then terminates the pod. Once the run finishes, the pod is gone, and everything you care about is on your Beekeeper server.

## Turning It On

Go to **Admin**, scroll to **Compute Providers**, and check **Enable Runpod**. Until you do, none of the Runpod options show up anywhere in Beekeeper.

You'll need a Runpod API key, which you can create in the Runpod console. Paste it into the **API Key** field and click **Test Connection**. If the key works, you'll get a list of GPU types with their current price and how many are in stock. Those names are the exact ones to use in a GPU list.

The key is saved in a file on your Beekeeper server that only Beekeeper's user can read. It isn't shown again after you save it, and it never goes to a pod. Leave the field blank on later saves to keep the key you have.

Before anything will run, you have to set at least one hard spend cap. That's on purpose, see below.

## Spend Caps

Runpod costs real money, so there are caps for three periods:

| Period | Resets |
|--------|--------|
| Daily | Midnight, server time |
| Monthly | The 1st of the month |
| Total | Only when you click **Reset Total Spend** |

Each period has a soft cap and a hard cap, and you can leave any of them blank.

- **Soft cap.** No new pods start. Runs already going keep going. Queued Runpod runs wait in the queue with a reason like `Runpod soft cap reached ($8.12 of $8.00 today)` and start once the period resets.
- **Hard cap.** Beekeeper stops every Runpod run, gives each one a short final sync, and terminates the pod. Saving the results comes second to staying under the cap.

If Runpod is enabled with no hard cap set in any period, every Runpod run is refused. That way a new install can't spend money until someone has picked a limit.

Beekeeper keeps its own running total of what each pod costs, using the price Runpod quotes for the pod and how long it's been up. Runpod's own billing numbers lag behind by minutes or more, so they can't be used to enforce a cap. Beekeeper's total is an estimate, and your Runpod bill is the real number.

The caps only work while Beekeeper is running. The last line of defense is your Runpod balance: when it hits $0, Runpod stops your pods. For a home lab, prepaid credits are the safest way to set this up. Load what you're willing to spend and nothing more.

## Sending a Project to Runpod

When you create a project, set **Run training on** to **Runpod**. For an existing project, it's under **Where to Run** on the Edit page. Once a project is set to Runpod, its edit page has a few more settings:

| Setting | What it does |
|---------|--------------|
| GPU list | GPU types to try, in order, one per line. Leave it empty to use the list from Admin. If both are empty, Beekeeper picks the cheapest card in stock with enough memory. |
| Image | The container image the pod runs. Empty means the default from Admin. |
| Sync data dir on startup | Upload the project's data directory to the pod before training. See [Data](#data). |

The smallest card Beekeeper will rent is set by **Minimum VRAM** under GPU Memory Management. If it's unset, the minimum is 16 GB. A card on your GPU list with less memory than that gets skipped, with a warning in the run log.

If nothing on the list is in stock, the run is refused with `NO_GPU_AVAILABLE`. Use **Add to Queue** and it'll keep trying every few seconds until a card frees up.

A Runpod project doesn't build an environment on your server. Setup stops after the git clone, with no venv, setup script or pip install here. The pod builds its own environment every run. If you move a project back to **This server**, Beekeeper builds the local environment then, and training is available again once setup finishes.

Conda projects can't run on Runpod yet. The pod builds a venv with the image's Python, which can be a different version than the one set on the project. The run log shows which Python the pod used.

## What Happens During a Run

Start a Runpod run the same way as any other: **Start**, or **Add to Queue**, or as a pipeline step. Before anything is rented, Beekeeper checks the caps, the upload size and GPU stock. If one of those refuses the run, nothing is spent and no run number is used.

From there, the run row on the project page shows the GPU and what the pod is doing:

1. **Starting pod.** Beekeeper rents the card and waits for it to come up. That usually takes 15 to 30 seconds with the default image.
2. **Uploading.** The workspace goes up, at the branch Beekeeper already checked out here. Your repo is never cloned on the pod, so it doesn't need git credentials for private repos.
3. **Installing.** Runs your setup script, creates a venv and runs `pip install`. The venv can see the image's own packages, so with the default PyTorch image, torch doesn't get downloaded again every run.
4. **Training.** The log streams back to the project page every few seconds, like a local run. The run folder syncs home every **Result sync interval** (10 minutes by default, set in Admin). That interval is the most you can lose if a pod dies mid-run.
5. **Syncing results.** When training ends, Beekeeper does one last full sync and checks that every file on the pod made it home at the same size. Only then is the pod terminated.

The run ends up looking like any local run: same run ID and ref, outputs in its run folder, TensorBoard, history row. The log has a few extra `[beekeeper]` lines saying which pod and GPU it got, how long each step took, and what the run cost:

```
[beekeeper] Runpod pod jttvknafkpwli0 (bk-021500-iris-runpod-1): NVIDIA RTX 4000 SFF Ada Generation 20 GB, $0.18/hr, community cloud, image runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04
[beekeeper] Pod reachable after 17s
...
[beekeeper] Results synced and verified
[beekeeper] Pod jttvknafkpwli0 terminated
[beekeeper] Runpod cost for this run: $0.0028 (Beekeeper's estimate)
```

Your script sees the same environment variables it would locally: `BEEKEEPER_RUN_DIR`, `BEEKEEPER_RUN_ID` and the rest, with paths that point at the pod's copy. Your project's environment variables go to the pod as well. Keep that in mind if any of them are secrets.

If the final sync can't confirm every file made it home, the run is marked crashed, even if training itself exited cleanly.

## Data

A pod can't see your server's disks, so a project's [data directory](/docs/projects/#data-directory) has to be uploaded. Check **Sync data dir on startup** and Beekeeper uploads it before training. If a project has a data directory and sync is off, Runpod runs are refused with `DATA_DIR_NOT_SYNCED` rather than starting a pod that can't find its data.

Two things to watch here:

- The GPU bills while the data uploads, and a home upload connection is slow. 30 GB at 20 Mbps is around three and a half hours of paid GPU doing nothing.
- Everything that goes up per run counts against **Max upload per run** in Admin (20 GB by default). That's the workspace, the data directory and any pipeline inputs. A run over the limit is refused with `UPLOAD_TOO_LARGE`, and the message says which part is the big one.

If your data directory is a big folder and training only reads part of it, point the project at the subfolder it actually uses.

## Pipelines

Pipelines don't need any changes. A train step whose project runs on Runpod goes to Runpod, and the pipeline doesn't know the difference.

If a train step's inputs come from earlier steps (`BEEKEEPER_STEP_<NAME>_DIR`, `BEEKEEPER_PREV_STEP_DIR` or `BEEKEEPER_PIPELINE_RUN_DIR`), those folders are uploaded to the pod and the variables are rewritten to point at the uploaded copies. Its results sync home before the step counts as finished, so the next step finds them in the usual place.

Task steps always run on your Beekeeper server.

## Stopping a Run

**Stop** works like it does locally, except the pod gets to hand its results back first. Beekeeper stops the training, syncs, and then terminates the pod, so a Runpod run can take a little while to show as stopped.

Two limits stop a run on their own:

- **Max runtime per run**, in Admin, measured from when the pod was rented
- a **hard cap**

## The Nodes Page

With Runpod on, **Nodes** shows up in the sidebar. It has:

- spend against each cap
- the current burn rate
- every live pod, with its run, GPU, phase, price, uptime, cost so far and last sync
- a **Terminate** button for each pod, which stops the run with a short final sync and deletes the pod
- spend per day for the last 30 days
- recent Runpod runs and why each one ended

The dashboard gets a one-line **Remote Compute** strip under System Stats with the same short version: pods, burn rate and today's spend against its cap.

## Restarts and Lost Pods

Runpod runs survive a Beekeeper restart. When it comes back up, Beekeeper finds its pods and reattaches to any that are still training. It picks the log up where it left off, including everything the pod printed while Beekeeper was down, and carries on. A pod that was still uploading or installing when Beekeeper went down is stopped and marked "interrupted by restart". A pod that disappeared is marked lost, and you keep whatever was synced before it went.

If Beekeeper is down for a long time, the pod looks after itself. Once it's past its max runtime plus **Hold for sync** without Beekeeper collecting the results, it terminates itself. Runpod gives every pod its own key that can only act on that pod, so your account key never has to be on the pod.

Every pod is named `bk-<id>-<project>-<run>`, where the id belongs to your Beekeeper install. Beekeeper regularly checks the account for pods with its id that no run owns and terminates them, but only after they're 10 minutes old. Pods without its id, including ones started by hand or by another Beekeeper on the same account, are never touched.

## Using Runpod From an Agent

The [MCP server](/docs/mcp-server/#runpod) has `get_compute_status`, `list_runpod_gpus` and `terminate_pod`, and `create_project` and `update_project` take the Runpod settings. The endpoints are in the [API reference](/docs/api-reference/#runpod).
