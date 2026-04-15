name: agent-monitoring
description: Monitor agents + health check + changelog
parallel: true
chain:
  - skill: agent-trace-system
    args: "--tail 100"
    timeout: 15s
    on_error: fail
    parallel_group: "monitoring"
  - skill: ai-agent-coordinator
    args: "--status"
    timeout: 15s
    on_error: fail
    parallel_group: "monitoring"
  - skill: unified-monitor
    args: "--alert-only"
    timeout: 30s
    on_error: continue
    parallel_group: "monitoring"
  - skill: skill-changelog-bot
    args: "--since 7d"
    timeout: 30s
    on_error: continue
    parallel_group: "monitoring"
