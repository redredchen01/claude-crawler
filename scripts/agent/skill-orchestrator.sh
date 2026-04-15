#!/bin/bash
# scripts/agent/skill-orchestrator.sh — Phase 3 Optimized Skill Orchestrator
# Implements:
# 1. Shared JSON Cache (via scripts/lib/cache.sh)
# 2. Parallel Skill Execution
# 3. Robust Retry with Exponential Backoff
# 4. Fail-Fast vs Continue Error Handling

set -euo pipefail

# 1. Environment & Setup
WORKSPACE_ROOT="${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "$WORKSPACE_ROOT/scripts/lib/cache.sh"
source "$WORKSPACE_ROOT/scripts/lib/core.sh"

WORKFLOWS_DIR="$WORKSPACE_ROOT/docs/workflows"
ensure_dir "$WORKFLOWS_DIR"

DRY_RUN=0
TRACE=0
WORKFLOW_NAME=""

# Usage
usage() {
  echo "Usage: $0 --workflow <name> [--dry-run] [--trace]"
  exit 1
}

# Parse Args
while [[ $# -gt 0 ]]; do
  case $1 in
    --workflow) WORKFLOW_NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --trace) TRACE=1; shift ;;
    *) usage ;;
  esac
done

[ -z "$WORKFLOW_NAME" ] && usage

# 2. Skill Execution Engine
execute_skill() {
  local skill="$1"
  local args="${2:-}"
  local retry_count="${3:-1}"
  local on_error="${4:-fail}"
  
  local attempt=1
  local start_time=$(date +%s)
  
  # Inject Environment
  export OA_VAULT="${OA_VAULT:-$WORKSPACE_ROOT/obsidian}"
  export YD_WORKSPACE="$WORKSPACE_ROOT"
  
  while [ $attempt -le $retry_count ]; do
    log_info "[$WORKFLOW_NAME] Executing /$skill (Attempt $attempt/$retry_count)..."
    
    if [ $DRY_RUN -eq 1 ]; then
      log_info "[DRY-RUN] Would run: /$skill $args"
      return 0
    fi
    
    # --- Dynamic Routing Logic ---
    local cmd=""
    local exit_code=0
    
    # Self-Healing Check: Look at recent history
    if [ -f "$METRICS_FILE" ]; then
      local recent_failures=$(tail -n 100 "$METRICS_FILE" | grep "\"name\":\"$skill\"" | grep "\"status\":\"failed\"" | wc -l | xargs)
      if [ "$recent_failures" -gt 2 ]; then
        log_warn "🔥 Detected high failure rate for $skill ($recent_failures/100). Boosting retry backoff."
        # Logic to boost backoff can be added to the retry loop
      fi
    fi
    
    # 1. Check local agent scripts
    if [ -f "$WORKSPACE_ROOT/scripts/agent/${skill}.sh" ]; then
      cmd="bash $WORKSPACE_ROOT/scripts/agent/${skill}.sh"
    elif [ -f "$WORKSPACE_ROOT/scripts/${skill}.sh" ]; then
      cmd="bash $WORKSPACE_ROOT/scripts/${skill}.sh"
    # 2. Check global command definitions
    elif [ -f "$HOME/.claude/commands/${skill}.md" ]; then
      local md_file="$HOME/.claude/commands/${skill}.md"
      # Try to extract bash code block from the .md file
      # We look for the first ```bash block
      local bash_content=$(awk '/```bash/ {flag=1; next} /```/ {flag=0} flag' "$md_file")
      
      if [ -n "$bash_content" ]; then
        log_info "Extracted bash from $md_file"
        local tmp_script="/tmp/skill_exec_${skill}_$$.sh"
        echo "#!/bin/bash" > "$tmp_script"
        
        # Clean the extracted content:
        # 1. Remove lines that start with /skill-name (argument hints)
        # 2. Prepend arguments
        echo "set -- $args" >> "$tmp_script"
        echo "$bash_content" | grep -v "^/${skill}" >> "$tmp_script"
        
        chmod +x "$tmp_script"
        cmd="zsh $tmp_script"
        # Reset args since they are now part of the script
        args=""
      else
        # Fallback to /Skill if no bash block found
        cmd="/Skill --skill $skill"
      fi
    else
      # 3. Last resort fallback
      cmd="/Skill --skill $skill"
    fi
    
    log_info "Running: $cmd $args"
    
    set +e
    $cmd $args
    exit_code=$?
    set -e
    
    # -----------------------------
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $exit_code -eq 0 ]; then
      log_info "✓ $skill success (${duration}s)"
      report_metric "skill_run" "$skill" "$duration" "success" "{\"workflow\": \"$WORKFLOW_NAME\", \"attempt\": $attempt}"
      return 0
    fi
    
    # Handle /Skill not found (exit 127) by suggesting alternative
    if [ $exit_code -eq 127 ]; then
      log_warn "Command '$cmd' not found (exit 127)."
      log_warn "If this is a Claude Skill, please ensure you are running in a terminal that supports /Skill."
    fi
    
    log_warn "⚠️ $skill failed with exit code $exit_code"
    
    if [ $attempt -lt $retry_count ]; then
      local base_backoff=$((attempt * 5))
      local backoff=$base_backoff
      
      # Apply boost if historically flaky
      if [[ "${recent_failures:-0}" -gt 2 ]]; then
        backoff=$((base_backoff * 2))
        log_info "⚡ Applied safety boost: ${backoff}s backoff (base: ${base_backoff}s)"
      fi
      
      log_info "Retrying in ${backoff}s..."
      sleep $backoff
    else
      log_error "❌ $skill failed after $retry_count attempts"
      report_metric "skill_run" "$skill" "$duration" "failed" "{\"workflow\": \"$WORKFLOW_NAME\", \"attempt\": $attempt, \"exit_code\": $exit_code}"
      
      if [ "$on_error" = "fail" ]; then
        return 1
      else
        log_warn "Continuing as per on_error=continue"
        return 0
      fi
    fi
    
    ((attempt++))
  done
}

# 3. Parallel Execution Logic
run_parallel_group() {
  local group_name="$1"
  shift
  local skills=("$@") # Array of "skill:args:retry:on_error"
  
  log_info "⚡ Starting Parallel Group: $group_name"
  
  local pids=()
  local entry skill args retry on_error
  for entry in "${skills[@]}"; do
    IFS=':' read -r skill args retry on_error <<< "$entry"
    execute_skill "$skill" "$args" "$retry" "$on_error" &
    pids+=($!)
  done
  
  # Wait for all background tasks
  local failed=0
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      ((failed++))
    fi
  done
  
  if [ $failed -gt 0 ]; then
    log_warn "⚠️ $failed skills failed in group $group_name"
  fi
}

# 4. Workflow Runner
run_workflow() {
  local workflow_file="$WORKFLOWS_DIR/${WORKFLOW_NAME}.workflow"
  if [ ! -f "$workflow_file" ]; then
    log_error "Workflow definition not found for $WORKFLOW_NAME"
    return 1
  fi

  log_info "Parsing $workflow_file..."
  
  # Extract skills into a list
  # Format in file is assumed to be the one we wrote earlier
  local current_group=""
  local group_skills=()
  
  # Read file line by line
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    
    # Detect new skill entry
    if [[ "$line" =~ ^[[:space:]]*-?[[:space:]]*skill:[[:space:]]*(.*) ]]; then
      local skill="${BASH_REMATCH[1]}"
      
      # If we were building a group, and the group changed, run the previous group
      # (In this simplified version, we just run sequentially unless in a parallel_group)
      
      # Read subsequent lines for this skill
      local args=""
      local retry=1
      local on_error="fail"
      local group="default"
      
      # Peak ahead logic would be complex in bash, so we use a different approach:
      # We'll use awk to pre-process the workflow into a flat list of skill:args:retry:on_error:group
    fi
  done < "$workflow_file"
  
  # Let's use awk to flatten the workflow for easier processing
  local flattened=$(awk '
    /^  - skill:/ { 
      if (skill != "") print skill "|" args "|" retry "|" on_error "|" group
      skill = $3; args = ""; retry = 1; on_error = "fail"; group = "default" 
    }
    /args:/ { $1=""; args = substr($0, 2); gsub(/^"/, "", args); gsub(/"$/, "", args) }
    /retry:/ { retry = $2 }
    /on_error:/ { on_error = $2 }
    /parallel_group:/ { group = $2; gsub(/"/, "", group) }
    END { print skill "|" args "|" retry "|" on_error "|" group }
  ' "$workflow_file")

  # Process the flattened list
  local last_group=""
  local pending_skills=()
  local skill args retry on_error group
  
  while IFS='|' read -r skill args retry on_error group; do
    [ -z "$skill" ] || [ "$skill" == "skill" ] && continue
    
    # Trim group
    group=$(echo "$group" | xargs)
    
    if [ "$group" != "default" ]; then
      if [ "$group" == "$last_group" ] || [ -z "$last_group" ]; then
        pending_skills+=("$skill:$args:$retry:$on_error")
        last_group="$group"
      else
        # Group changed, run previous group
        if [ ${#pending_skills[@]} -gt 0 ]; then
          run_parallel_group "$last_group" "${pending_skills[@]}"
          pending_skills=()
        fi
        pending_skills=("$skill:$args:$retry:$on_error")
        last_group="$group"
      fi
    else
      # Transition from parallel to sequential
      if [ ${#pending_skills[@]} -gt 0 ]; then
        run_parallel_group "$last_group" "${pending_skills[@]}"
        pending_skills=()
        last_group=""
      fi
      # Run sequential skill
      execute_skill "$skill" "$args" "$retry" "$on_error"
    fi
  done <<< "$flattened"
  
  # Final group
  if [ ${#pending_skills[@]} -gt 0 ]; then
    run_parallel_group "$last_group" "${pending_skills[@]}"
  fi
}

# Start execution
log_info "🚀 Starting Phase 3 Orchestrator"
log_info "Workflow: $WORKFLOW_NAME"

# Global Workflow Cache Setup
export WORKFLOW_NAME="$WORKFLOW_NAME"
CACHE_FILE=$(get_cache_path "$WORKFLOW_NAME" "vault")
export VAULT_QUERY_CACHE="$CACHE_FILE"

WF_START=$(date +%s)
run_workflow
WF_END=$(date +%s)
WF_DUR=$((WF_END - WF_START))

report_metric "workflow_run" "$WORKFLOW_NAME" "$WF_DUR" "complete" "{}"

log_info "✅ Workflow $WORKFLOW_NAME complete (${WF_DUR}s)"
