---
title: Pipelines
description: Chain training runs and shell tasks into one repeatable run.
---

A lot of my training work isn't one run. It's download the data, pretrain, fine-tune on top of the pretrained weights, then copy the model somewhere useful. Before pipelines, that meant babysitting each step and kicking off the next one by hand. A pipeline lets you write those steps down once, start it, and walk away.

Each pipeline is a list of steps that run top to bottom. A step starts when the one above it succeeds. If a step fails, the pipeline stops there and waits for you.

There are two kinds of step:

- **Train steps** queue a training run on one of your projects and wait for it to finish.
- **Task steps** run a shell command, for the glue work between training runs.

Steps hand files to each other the way scripts do in a local repo. If `pretrain.py` leaves `checkpoints/pretrained.pt` behind, the next step can open `checkpoints/pretrained.pt` too. See [Passing Files Between Steps](#passing-files-between-steps).

## Creating a Pipeline

Click **Pipelines** in the sidebar, then **+ New Pipeline**. You can build it in the graphical editor or write YAML directly. The two tabs edit the same definition, so you can switch back and forth. One catch: the graphical view rewrites the YAML, so any comments you've written there get dropped. You'll get a warning before that happens.

Here's what a definition looks like. It's one project, `chess`, with `checkpoints` and `data` as its output paths:

```yaml
name: chess-factory
description: Fetch games, pretrain, check, fine-tune, and export the chess model
folder: chess
steps:
  - name: fetch-data
    type: task
    project: chess
    command: bash scripts/download_games.sh
  - name: pretrain
    type: train
    project: chess
    script: pretrain.py
    inherit: [data]
  - name: check
    type: task
    project: chess
    inherit: [checkpoints, data]
    command: test -s checkpoints/pretrained.pt
  - name: fine-tune
    type: train
    project: chess
    script: finetune.py
    branch: experiment/lower-lr
    inherit: [checkpoints, data]
    env_vars:
      EPOCHS: "3"
  - name: export
    type: task
    inherit: [checkpoints]
    command: cp checkpoints/finetuned.pt /models/chess.pt
```

`fetch-data` downloads games into `data/`. `pretrain` gets a copy of that `data/` and writes `checkpoints/`. `check` makes sure the checkpoint exists and passes both folders on. `fine-tune` gets both folders, and `export` copies the result out. None of the scripts or commands use an absolute path or a Beekeeper environment variable.

Hit **Validate** to check it before saving. Errors point at the exact field, like `steps[3].env_vars.EPOCHS`.

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
| `script` | no | The script to run, relative to the repo, like `finetune.py`. Defaults to the project's train file. |
| `branch` | no | Defaults to the project's branch. |
| `inherit` | no | Output paths to copy from the previous step. See [Passing Files Between Steps](#passing-files-between-steps). |
| `env_vars` | no | Extra environment variables for this run, on top of the project's own. Names starting with `BEEKEEPER_` are reserved. |

A train step doesn't get special treatment. It goes into the project's normal [run queue](/docs/training/#run-queue), so parallel run limits and GPU memory checks still apply. If the project is busy, the step waits its turn, and the pipeline page shows it as **waiting** along with its spot in line.

`script` is what lets one project hold a whole pipeline. A repo with `pretrain.py` and `finetune.py` is one project with two train steps, not two projects pointed at the same repo. Every run records the script it ran, and the project's run history shows it in the **Script** column.

### Task steps

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Same rules as train steps. |
| `type` | yes | `task` |
| `command` | yes | Run with `bash -c`, so pipes, `&&` and multi-line scripts all work. |
| `project` | no | Run the command in this project's workspace. See [Project Tasks](#project-tasks). |
| `inherit` | no | Output paths to copy from the previous step. |
| `timeout_s` | no | Seconds before the task is killed. Defaults to 3600, max 86400. |

A task succeeds if the command exits with 0. Anything else fails the step.

Where the command runs depends on the step:

| Task | Runs in |
|------|---------|
| With `project` | That project's workspace, with the project's environment. |
| No `project`, with `inherit` | Its own folder, `steps/<step name>/` inside the pipeline run folder, holding the inherited paths. |
| No `project`, no `inherit` | The pipeline run folder, which is empty the first time. A relative path like `./download.sh` won't find your script there, so use an absolute path or `cd` first. |

Tasks run as the Beekeeper user, with the same access to the server that Beekeeper has. If that's not something you want, an administrator can turn task steps off under **Admin**, with the **Allow inline task steps in pipelines** toggle. With it off, pipelines that only have train steps keep working, and anything with a task step, project tasks included, is refused.

### YAML gotchas

YAML guesses types, and it doesn't always guess what you meant. `EPOCHS: 3` is a number, `DEBUG: no` is `false`, and `LR: 0.001` is a float. Environment variables have to be strings, so quote them: `EPOCHS: "3"`. The validator catches this and tells you to quote it, but it's easier to just get in the habit.

## Passing Files Between Steps

On your own machine, a two-stage job is two scripts in one folder. The first leaves files behind, and the second opens them by relative path. `inherit` gives a pipeline step the same thing: a copy of the previous step's output paths, at the same relative paths.

```yaml
  - name: fine-tune
    type: train
    project: chess
    script: finetune.py
    inherit: [checkpoints, data]
```

`finetune.py` opens `checkpoints/pretrained.pt` and `data/games.pgn`, exactly as it would on your laptop.

The rules:

- **It's opt-in.** A step without `inherit` gets nothing copied.
- **It names output paths, not steps.** The paths have to be [output paths](/docs/training/#artifact-storage) of the previous step's project and of this step's project. A task without a project only needs the previous step to have them.
- **It only takes from the previous step.** A step can't reach two steps back with `inherit`. Passing a folder down a chain works because each step that inherits a path also has it, so the next step can inherit it from there.
- **It copies.** The files land in this run's own run folder, so a step that changes an inherited file never touches the earlier run. Beekeeper copies with `cp --reflink=auto`, which costs nothing on btrfs or XFS and is a normal copy on ext4.
- **It doesn't change where the run writes.** The inherited `checkpoints/` is the same folder the script saves into, so anything it adds is kept with the run and passed on if the next step inherits `checkpoints` too.

The run log says what came across:

```
[beekeeper] Inherited model/ from produce (inherit-runpod-1): 2 files, 751 B
```

The run folder also gets a record of it at `.beekeeper/inherited.json`:

```json
{"inherited": [{"path": "model", "source_step": "produce", "source_run_ref": "inherit-runpod-1", "files": 2, "bytes": 751}]}
```

A step's inherited paths also show in its panel on the pipeline page, with a link to the run they came from.

### When an Output Path Is Missing

Validation checks both sides of every `inherit`. Here `posttrain` asks for `checkpoints`, but the project only lists `model`:

```json
[
  {
    "message": "'checkpoints' isn't an output path of the previous step (pretrain)",
    "path": "steps[1].inherit"
  },
  {
    "error_code": "INHERIT_PATH_NOT_DECLARED",
    "fix": {"call": "update_project", "project": "inherit-local", "output_paths_add": ["checkpoints"]},
    "message": "inherit-local doesn't list 'checkpoints' as an output path",
    "path": "steps[1].inherit"
  }
]
```

In the editor, the second error comes with a button: **Add checkpoints to inherit-local's output paths**. Beekeeper never adds it on its own, because an output path changes every run of the project, standalone runs included: they'll all save `checkpoints/` in their run folder from then on. Through the [API](/docs/api-reference/#pipelines), the `fix` object is the exact call to make.

Other things validation catches:

- `inherit` on the first step (`the first step has nothing to inherit from`).
- An inherited path that's also the project's TensorBoard dir, or its data dir link when it has a data dir (`data` by default).

When the step starts, Beekeeper checks again, since project settings can change after a pipeline is saved. It also fails the step, before anything runs or any pod is rented, if the earlier run's folder doesn't have the path, or if the path is a real, tracked file or folder in the receiving repo. An inherited folder that exists but is empty only gets a warning in the log.

## Project Tasks

A task with a `project` runs in that project's workspace on the Beekeeper server, as if you'd typed the command in the repo:

```yaml
  - name: quantize
    type: task
    project: chess
    inherit: [checkpoints]
    command: python scripts/quantize.py checkpoints/pretrained.pt checkpoints/pretrained-q.pt
```

- `python` is the project's environment, and the project's environment variables are set.
- It inherits and passes on output paths like a train step, using the project's output paths.
- It's a run of the project. It goes through the project's queue, so it waits if the project is busy, and gets its own workspace clone if the project allows parallel runs. It shows up in the project's run history marked `task`, with the command in the **Script** column. The history has an **All / Training / Tasks** switch.
- It gets no GPU. `CUDA_VISIBLE_DEVICES` is empty. Anything that needs a GPU should be a train step with a `script`.
- The setup script and `pip install` don't run. The task uses the environment as it is.
- A task that hits `timeout_s` is stopped and shows "timed out after Ns".

Project tasks run on the Beekeeper server, even for a [Runpod](/docs/cloud-providers/runpod/) project. A Runpod project has no environment on the server, so validation says so and offers **Build a local environment for chess**. Its training stays on Runpod. While the environment builds, the project can't start Runpod runs.

## Advanced: Environment Variables

Steps also get environment variables pointing at the folders earlier steps wrote to. `inherit` covers the common case, but the variables are still there for anything it can't do, like a compare step that needs files from two different earlier steps.

| Variable | Points to |
|----------|-----------|
| `BEEKEEPER_PREV_STEP_DIR` | The output folder of the step right before this one |
| `BEEKEEPER_STEP_<NAME>_DIR` | The output folder of an earlier step, by name. `fine-tune` becomes `BEEKEEPER_STEP_FINE_TUNE_DIR`. |
| `BEEKEEPER_PIPELINE_RUN_DIR` | A folder shared by the whole pipeline run |
| `BEEKEEPER_PIPELINE` | The pipeline's name |
| `BEEKEEPER_PIPELINE_RUN_ID` | The pipeline run number |

For a train step or project task, the output folder is that run's [persistent run directory](/docs/training/#artifact-storage), the same one your script sees as `BEEKEEPER_RUN_DIR`. For a task without a project it's its own folder if it inherits, otherwise the pipeline run folder.

A step that uses `inherit` doesn't get `BEEKEEPER_PREV_STEP_DIR` or the `BEEKEEPER_STEP_*` variables. It gets the `BEEKEEPER_PIPELINE*` ones. The two ways of passing files don't mix in one step.

Here's a compare step that reads two training runs. It doesn't inherit, so it has the variables:

```yaml
  - name: compare
    type: task
    command: |
      for s in BASELINE RETRAIN; do
        d=BEEKEEPER_STEP_TRAIN_${s}_DIR
        echo "$s: final val_acc=$(tail -1 "${!d}/outputs/results.csv" | cut -d, -f5)"
      done
```

which prints:

```
BASELINE: final val_acc=0.933333
RETRAIN: final val_acc=0.933333
```

## Running a Pipeline

Click **Run Pipeline** on the pipeline's page. The dialog lets you pick a branch for each train step, which is how I run experiments: same pipeline, different branch on the fine-tune step. Leave a step alone and it uses the branch from the definition, or the project's branch if there isn't one.

You can start a pipeline again while it's already running. The new run goes into the pipeline's queue and starts when the current one finishes. Runs go in first-in, first-out order.

The pipeline page shows the step chain for the current run. Click a task step to see its log right there. A train step or project task links to its run instead (something like `chess-12`), and the full log is on the other end of that link. **Run History** at the bottom lists past runs with the branches each one used. Finished pipeline runs also show on the [Run History](/docs/training/#run-history-page) page, alongside training runs.

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
