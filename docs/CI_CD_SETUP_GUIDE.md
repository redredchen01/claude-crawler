---
title: YDK CI/CD Setup Guide
type: guide
tags: [ci/cd, automation, github-actions, python, pypi]
created: 2026-04-07
updated: 2026-04-07
status: active
---

# YDK CI/CD Setup Guide (Phase 2)

**Status**: Implementation ready  
**Last Updated**: 2026-04-07  
**Phase**: 2 (GitHub Actions CI/CD Pipeline)

---

## Quick Setup (5 minutes)

1. **Choose PyPI authentication**:
   - Option A (Recommended): Trusted Publisher (no secrets needed)
   - Option B: API Token (legacy approach)

2. **Configure GitHub**:
   - Go to Settings → Secrets and variables (if using API token)
   - Add `PYPI_API_TOKEN` (optional)

3. **Test locally**:
   ```bash
   bash scripts/test-version-workflow.sh
   ```

4. **Deploy**:
   ```bash
   git push origin main
   # Watch: https://github.com/YOUR_REPO/actions
   ```

---

## PyPI Configuration

### Trusted Publisher (Recommended)
1. Go to https://pypi.org/manage/project/yd-utility-kit/
2. Settings → Publishing → Add trusted publisher
3. Select GitHub Actions
4. Fill: repository, workflow=publish.yml
5. Done!

### API Token (Legacy)
1. Create at https://pypi.org/manage/account/tokens/
2. Add to GitHub Secrets as `PYPI_API_TOKEN`

---

## Workflow Diagram

```
Code Change
    ↓
Push to main
    ↓
GitHub Actions triggers
    ↓
Version detected
    ↓
Creates git tag
    ↓
Publishes to PyPI
    ↓
Creates GitHub Release
    ↓
Updates Obsidian
    ↓
✅ Done!
```

---

## Local Testing

```bash
# 1. Check current version
grep '^version = ' projects/production/yd-utility-kit/pyproject.toml

# 2. Run test suite
bash scripts/test-version-workflow.sh

# 3. Dry-run version bump
bash scripts/version-bump-bridge.sh --dry-run
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Workflow not triggering | Check file paths match trigger condition |
| No version bump | Update pyproject.toml version number |
| PyPI auth fails | Verify Trusted Publisher or API token |
| Obsidian not updating | Ensure vault file exists in repo |

---

## Next Steps

- Phase 3: PyPI Trusted Publisher security audit
- Phase 4: Complete feedback loop with Slack + reporting
