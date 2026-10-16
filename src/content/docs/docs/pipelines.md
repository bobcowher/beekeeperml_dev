---
title: Pipelines
description: Chain training runs and shell tasks into one repeatable run.
---

A lot of my training work isn't one run. It's download the data, pretrain, fine-tune on top of the pretrained weights, then copy the model somewhere useful. Before pipelines, that meant babysitting each step and kicking off the next one by hand. A pipeline lets you write those steps down once, start it, and walk away.

Each pipeline is a list of steps that run top to bottom. A step starts when the one above it succeeds. If a step fails, the pipeline stops there and waits for you.

There are two kinds of step:

- **Train steps** queue a training run on one of your projects and wait for it to finish.
- **Task steps** run a shell command on the server, for the glue work between training runs.

## Creating a Pipeline

Click **Pipelines** in the sidebar, then **+ New Pipeline**. You can build it in the graphical editor or write YAML directly. The two tabs edit the same definition, so you can switch back and forth. One catch: the graphical view rewrites the YAML, so any comments you've written there get dropped. You'll get a warning before that happens.

Here's what a definition looks like:

```yaml
name: chess-factory
description: Pretrain, fine-tune, and export the chess model
folder: chess
steps:
  - name: fetch-data
    type: task
    command: /home/me/scripts/download_games.sh
  - name: pretrain
    type: train
    project: chess-base
  - name: fine-tune
    type: train
    project: chess-ft
    branch: experiment/lower-lr
    env_vars:
      EPOCHS: "3"
  - name: export
    type: task
    command: cp "$BEEKEEPER_STEP_FINE_TUNE_DIR/model.pt" /models/chess.pt
```

Hit **Validate** to check it before saving. Errors point at the exact field, like `steps[2].env_vars.EPOCHS`.

### Top-level fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Lowercase letters, digits, `_` or `-`, up to 64 characters. Has to start with a letter or digit. |
| `description` | no | Shown on the Pipelines list. |
| `folder` | no | See [Folders](/docs/projects/#folders). |
| `steps` | yes | A list of 1 to 32 steps. |

### Train steps

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Lowercase letters, digits, `_` or `-`, up to 32 characters. |
| `type` | yes | `train` |
| `project` | yes | The project to train. It has to exist when the pipeline starts. |
| `branch` | no | Defaults to the project's branch. |
| `env_vars` | no | Extra environment variables for this run, on top of the project's own. Names starting with `BEEKEEPER_` are reserved. |

A train step doesn't get special treatment. It goes into the project's normal [run queue](/docs/training/#run-queue), so parallel run limits and GPU memory checks still apply. If the project is busy, the step waits its turn, and the pipeline page shows it as **waiting** along with its spot in line.

### Task steps

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Same rules as train steps. |
| `type` | yes | `task` |
| `command` | yes | Run with `bash -c`, so pipes, `&&` and multi-line scripts all work. |
| `timeout_s` | no | Seconds before the task is killed. Defaults to 3600, max 86400. |

A task succeeds if the command exits with 0. Anything else fails the step.

Tasks start in the pipeline run's own folder, which is empty the first time. That means a relative path like `./download.sh` won't find your script. Use an absolute path, or `cd` somewhere first.

Tasks run as the Beekeeper user, with the same access to the server that Beekeeper has. If that's not something you want, an administrator can turn task steps off under **Admin**, with the **Allow inline task steps in pipelines** checkbox. With it off, pipelines that only have train steps keep working, and anything with a task step is refused.

### YAML gotchas

YAML guesses types, and it doesn't always guess what you meant. `EPOCHS: 3` is a number, `DEBUG: no` is `false`, and `LR: 0.001` is a float. Environment variables have to be strings, so quote them: `EPOCHS: "3"`. The validator catches this and tells you to quote it, but it's easier to just get in the habit.

## Passing Outputs Between Steps

Every step gets a few environment variables pointing at the folders the steps before it wrote to:

| Variable | Points to |
|----------|-----------|
| `BEEKEEPER_PREV_STEP_DIR` | The output folder of the step right before this one |
| `BEEKEEPER_STEP_<NAME>_DIR` | The output folder of an earlier step, by name. `fine-tune` becomes `BEEKEEPER_STEP_FINE_TUNE_DIR`. |
| `BEEKEEPER_PIPELINE_RUN_DIR` | A folder shared by the whole pipeline run |
| `BEEKEEPER_PIPELINE` | The pipeline's name |
| `BEEKEEPER_PIPELINE_RUN_ID` | The pipeline run number |

For a train step, the output folder is that run's [persistent run directory](/docs/training/#artifact-storage), the same one your script sees as `BEEKEEPER_RUN_DIR`. For a task step, it's the pipeline run folder.

So in the example above, `chess-ft`'s training script can load the pretrained weights with something like:

```python
import os

pretrained = os.path.join(os.environ["BEEKEEPER_STEP_PRETRAIN_DIR"], "model.pt")
```

The only thing you have to get right is saving your checkpoints into `BEEKEEPER_RUN_DIR` (or an output path you've set up to be saved). If they end up in the workspace, the next step won't be able to find them.

## Running a Pipeline

Click **Run Pipeline** on the pipeline's page. The dialog lets you pick a branch for each train step, which is how I run experiments: same pipeline, different branch on the fine-tune step. Leave a step alone and it uses the branch from the definition, or the project's branch if there isn't one.

You can start a pipeline again while it's already running. The new run goes into the pipeline's queue and starts when the current one finishes. Runs go in first-in, first-out order.

The pipeline page shows the step chain for the current run. Click a task step to see its log right there. A train step links to its training run instead (something like `chess-ft-12`), and the full log is on the other end of that link. **Run History** at the bottom lists past runs with the branches each one used.

Editing a pipeline doesn't touch runs that are already going. Each run keeps the definition it started with.

## When a Step Fails

The pipeline stops at the failed step and marks everything after it as skipped. The step panel shows the error. Fix whatever went wrong, then you've got two options:

- **Resume** picks up at the failed step. Steps that already succeeded aren't run again, and their outputs are reused.
- **Skip and continue** leaves the failed run as it is and lets the next queued run start.

A failed run holds up the queue behind it until you do one or the other. That way a broken step doesn't quietly chew through every run you've lined up behind it.

**Cancel Run** stops the current step and ends the run. A cancelled run can be resumed too.

### Re-running From a Step

Sometimes every step succeeded and you just want to redo the last part, like re-running the fine-tune with a tweak without pretraining again. Open the step on the latest run and click **Re-run from this step**. That step and everything after it run again as new attempts, and the steps before it keep their outputs.

Both Resume and Re-run need the earlier steps' output folders to still exist. If one has been cleaned up, Beekeeper tells you which one and refuses rather than running the step with missing inputs. Only the latest run of a pipeline can be resumed or re-run.

## Restarts

Pipelines survive a Beekeeper restart, but the steps that were running when it went down don't always. A task step that was running is failed with "interrupted by restart". A train step gets 60 seconds to show it's still alive, then it's failed with "run lost". Either way, you can **Resume** once Beekeeper is back up.

## Deleting a Pipeline

**Delete Pipeline** removes the definition and its run history. The training runs it started stay in each project's history. You can't delete a pipeline while one of its runs is going, so cancel it first.

## Using Pipelines From an Agent

Everything here is available through the [API](/docs/api-reference/#pipelines) and the [MCP server](/docs/mcp-server/#pipelines). An agent can write the YAML, check it with `validate_pipeline`, start runs with different branches, and resume them when something breaks.
