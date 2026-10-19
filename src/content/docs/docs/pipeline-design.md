---
title: Designing a Pipeline
description: How to turn a set of training scripts into a pipeline that's easy to rerun, check and trust.
---

The [Pipelines](/docs/pipelines/) page covers every field. This page covers how to decide what goes in them. The short version: design the pipeline as if you were running the scripts by hand in one repo, then tell Beekeeper which folders each step needs.

Everything below uses one example, a small classifier in [beekeeper-pipeline-example](https://github.com/bobcowher/beekeeper-pipeline-example). The model is a numpy MLP, so every step takes a second or two on a CPU and you can run the whole thing yourself. The output on this page comes from real runs of it.

## Start With Scripts You Can Run by Hand

Before writing any YAML, get the chain working locally as plain scripts, run from the repo root, that read and write relative paths. The example has three:

| Script | Reads | Writes |
|---|---|---|
| `prepare.py` | nothing | `dataset/` |
| `train.py` | `dataset/` | `checkpoints/` |
| `evaluate.py` | `checkpoints/`, `dataset/`, `data/champion/` | `eval/` |

Run by hand, it looks like this:

```bash
python prepare.py
python train.py
python evaluate.py
mkdir -p data/champion && cp checkpoints/model.npz eval/report.json data/champion/
```

```
dataset/: 1440 train and 360 test examples, 3 classes
epoch 100: train accuracy 0.933
epoch 200: train accuracy 0.968
epoch 300: train accuracy 0.987
saved checkpoints/model.npz
test accuracy 0.978; no champion yet
```

None of the scripts know about Beekeeper. There's no `BEEKEEPER_` variable and no absolute path in any of them, and that's the goal. A script that only works inside a pipeline is hard to debug, because the only way to try a fix is to run the pipeline again.

## One Project, One Script per Step

All four steps live in one repo, so they're one project with a different `script` on each train step. That keeps the code in one place and the run history in one list, and every step runs the same branch unless you override it.

Separate projects make sense when the steps really are different:

- **Different repos.** A data pipeline maintained by someone else feeding your training code.
- **Different compute.** Pretraining on a [Runpod](/docs/cloud-providers/runpod/) project while the cheap steps stay on your own server.
- **Different environments.** One step needs packages that conflict with another's.

If none of those apply, use one project.

## Pick a Step Type for Each Stage

The step type decides where the work runs and what it gets:

| The stage... | Use | Why |
|---|---|---|
| needs a GPU, or is the main event | train step with `script` | Goes through the project's queue, gets a GPU, shows up as a run with logs and TensorBoard. |
| is quick CPU work in the repo | project task | Runs in the project's workspace with its environment, but gets no GPU. |
| changes something outside Beekeeper | task without a project | Restarting a service or calling a webhook doesn't belong to any one run. |

"Train step" means "a run of the project", not that it has to train anything. `evaluate.py` doesn't, but it's a train step in the example because evals usually need a GPU. A train step runs one script with no arguments, so a stage that's several commands needs a small wrapper script.

Don't make an eval a plain task that sets `CUDA_VISIBLE_DEVICES` itself. Beekeeper picks a card by how much memory is free when a run starts. It doesn't know a task is about to use a card, so the task and a training run can end up sharing one. The same goes for a service on the server that loads a model onto a GPU when it gets a request.

The example's `prepare` and `promote` are project tasks. Both are quick and need the repo, and `promote` needs the project's data dir.

## Decide Where Each File Lives

This is the decision that matters most. Every file a step reads has to live in one of three places, depending on who needs it:

| Who reads it | Where it lives | Example |
|---|---|---|
| The next step | An [output path](/docs/training/#artifact-storage), passed with `inherit` | `checkpoints/`, `dataset/`, `eval/` |
| Later pipeline runs too | The project's [data dir](/docs/projects/#data-directory), which every run shares | `data/champion/` |
| Something outside Beekeeper | Wherever that thing reads from, written by a task | A model server's folder |

**Output paths belong to one run.** Each run gets its own copy, so run #3's checkpoints never overwrite run #2's. This is what you want for anything a run produces.

**The data dir is shared.** It's a link to the same folder on the server for every run, so it's the place for things that outlive one run: datasets you don't want to rebuild, and the model a new one has to beat. Because it's shared, only write to it on purpose, from a step near the end. A pipeline where `train` writes into `data/` leaves half-finished files there when a later step fails, and resuming the run won't clean them up.

**Not in the repo.** Every run starts by resetting the workspace to the branch, so a step that changes a tracked file loses the change on the next run. Results you want to keep in git go in an output path first, and you commit them yourself.

**Outside Beekeeper is the last step's job.** Deploying, copying to a model server or restarting a service happens once, at the end, after the gates have passed.

### Passing files down the chain

`inherit` only takes from the previous step. When a step further down needs something, every step in between inherits it and so passes it on:

```yaml
  - name: train
    inherit: [dataset]
  - name: evaluate
    inherit: [checkpoints, dataset]
  - name: promote
    inherit: [checkpoints, eval]
```

`promote` needs the weights `train` made. It gets them from `evaluate`, which inherited them from `train`. Each step's run folder ends up holding everything it was given and everything it made:

```
checkpoints/config.json
checkpoints/model.npz
dataset/test.npz
dataset/train.npz
eval/report.json
.beekeeper/inherited.json
```

That's `evaluate`'s folder, `spirals-10`. Everything except `eval/` was inherited, and the manifest says where it came from:

```json
{"inherited": [
  {"path": "checkpoints", "source_step": "train", "source_run_ref": "spirals-9", "files": 2, "bytes": 4102},
  {"path": "dataset", "source_step": "train", "source_run_ref": "spirals-9", "files": 2, "bytes": 44180}
]}
```

Inherited files are copies. A 4 KB checkpoint costs nothing, but on ext4 a 5 GB one passed through four steps is stored four times. On btrfs or XFS the copies share blocks and cost nothing. For big checkpoints on ext4, pass them only as far as they're needed, and only the part a step reads. `inherit: [checkpoints/pretrain]` copies that one folder and leaves the rest of `checkpoints/` behind.

### Fail loudly when a file is missing

A script that reads an inherited file should stop if the file isn't there, not fall back to something else. This is the pattern to avoid:

```python
ckpt = "checkpoints/pretrain/model.pth"
if not os.path.exists(ckpt):
    ckpt = "data/checkpoints/pretrain/model.pth"   # an older model, quietly
```

When `inherit` is set up wrong, this trains on top of whatever happens to be in `data/`. The run succeeds and the result looks plausible. Beekeeper checks that inherited paths exist before a step starts, but it can't know which file inside them your script wanted. Let the open fail.

## Use Gates to Stop Bad Runs

A step that exits with anything but 0 stops the pipeline, and everything after it is skipped. Use that on purpose. `evaluate.py` exits 1 when the new model doesn't beat the champion, so `promote` never runs for a worse model.

Running the example a second time with the same settings gives the same model, which doesn't beat itself:

```
[beekeeper] Inherited checkpoints/ from train (spirals-6): 2 files, 4.1 KB
[beekeeper] Inherited dataset/ from train (spirals-6): 2 files, 44.2 KB
test accuracy 0.978 doesn't beat the champion's 0.978

============================================================
  BEEKEEPER RUN END
  2026-10-18 10:29:00  |  elapsed: 00:00:01
  status  : CRASHED (exit 1)
============================================================
```

The pipeline page shows it as failed at `evaluate` with "training run crashed", and `promote` as skipped. That's the gate doing its job. Beekeeper doesn't tell a gate apart from a real crash, so print the reason before exiting, the way `evaluate.py` does.

A failed run holds up any runs queued behind it until you resume it or click **Skip and continue**. For a gate, skipping is usually the right call.

To try a different setting, put it in the train step's `env_vars`:

```yaml
  - name: train
    type: train
    project: spirals
    script: train.py
    inherit: [dataset]
    env_vars:
      EPOCHS: "600"
```

Run #3, with 600 epochs, gets past the gate and promotes:

```
test accuracy 0.994 beats the champion's 0.978
```

## Keep the Runs That Matter

Beekeeper prunes old runs once a project has more than its history limit, and a pruned run's folder is deleted along with it. That's fine for experiments, but not for the run whose model you promoted. You'll want its checkpoints and logs when you need to retrain or roll back.

`keep: on_success` keeps every run of the pipeline that succeeds:

```yaml
name: spirals
keep: on_success
```

A kept run's training and task runs are never pruned. Runs that fail a gate aren't kept and get cleaned up as usual. You can also keep or release any single run with **Keep Run** on the pipeline page. See [Keeping Runs](/docs/pipelines/#keeping-runs).

## The Whole Pipeline

```yaml
name: spirals
description: Build the dataset, train, and promote the model if it beats the champion
keep: on_success
steps:
  - name: prepare
    type: task
    project: spirals
    command: python prepare.py
  - name: train
    type: train
    project: spirals
    script: train.py
    inherit: [dataset]
  - name: evaluate
    type: train
    project: spirals
    script: evaluate.py
    inherit: [checkpoints, dataset]
  - name: promote
    type: task
    project: spirals
    inherit: [checkpoints, eval]
    command: mkdir -p data/champion && cp checkpoints/model.npz eval/report.json data/champion/
```

The project it runs on needs:

- **Train file:** `train.py`. Steps with a `script` override it.
- **Output paths:** `dataset`, `checkpoints` and `eval`.
- **Data directory:** on, with `data` linked to a folder on the server.

To run it yourself, create the project from the example repo with those settings, paste the YAML into a new pipeline, and run it. Each step's log starts with what it inherited:

```
[beekeeper] Inherited checkpoints/ from evaluate (spirals-3): 2 files, 4.1 KB
[beekeeper] Inherited eval/ from evaluate (spirals-3): 1 file, 140 B
```

## Before You Run It

- Every script runs by hand from the repo root, with relative paths.
- Every folder a step writes for a later step is an output path of its project.
- Nothing reads a `BEEKEEPER_` variable to find its input.
- A script stops with an error when an input is missing, instead of falling back.
- Only the last steps write to the data dir or outside Beekeeper.
- Gates exit non-zero and print why.
- `keep: on_success` is set if the pipeline promotes anything.
