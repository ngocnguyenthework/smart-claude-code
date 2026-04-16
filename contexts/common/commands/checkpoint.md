---
description: Create or verify a named checkpoint in your workflow. Usage: /checkpoint [create|verify|list] [name]
---

# Checkpoint Command

Create or verify a checkpoint in your workflow.

## Usage

`/checkpoint [create|verify|list] [name]`

## Create Checkpoint

When creating a checkpoint:

1. Run a quick sanity check — verify current state is clean
2. Create a git stash or commit with checkpoint name
3. Log checkpoint to `.claude/checkpoints.log`:

```bash
echo "$(date +%Y-%m-%d-%H:%M) | $CHECKPOINT_NAME | $(git rev-parse --short HEAD)" >> .claude/checkpoints.log
```

4. Report checkpoint created with SHA and timestamp

## Verify Checkpoint

When verifying against a checkpoint:
1. Read checkpoint from log
2. Compare current state: files added, files modified, test pass rate, coverage
3. Report comparison summary

## List Checkpoints

Show all checkpoints with: Name, Timestamp, Git SHA, Status (current/behind/ahead)

## Typical Workflow

```
/checkpoint create "feature-start"
→ implement core logic
/checkpoint create "core-done"
→ add tests
/checkpoint verify "core-done"
→ refactor
/checkpoint create "refactor-done"
→ PR
/checkpoint verify "feature-start"
```

## Arguments

$ARGUMENTS:
- `create <name>` — Create named checkpoint
- `verify <name>` — Verify against named checkpoint
- `list` — Show all checkpoints
- `clear` — Remove old checkpoints (keeps last 5)
