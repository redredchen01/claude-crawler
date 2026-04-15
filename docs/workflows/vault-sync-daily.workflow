name: vault-sync-daily
description: Weekly full vault→PM tool sync + team snapshot
parallel: true
chain:
  - skill: vault-query-cache
    args: "--workflow vault-sync-daily"
    timeout: 30s
    on_error: fail
    parallel_group: "cache"
  - skill: vault-progress-sync
    args: "--direction bidirectional"
    timeout: 60s
    on_error: fail
    parallel_group: "sync-parallel"
  - skill: obsidian-daily-snapshot
    args: "--output slack"
    timeout: 30s
    on_error: continue
    parallel_group: "sync-parallel"
  - skill: tool-ecosystem-bridge
    args: "--from obsidian --to github"
    timeout: 30s
    on_error: continue
    parallel_group: "sync-parallel"
