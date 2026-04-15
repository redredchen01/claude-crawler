# GitHub Actions CI/CD Quickstart

**Phase 2: Implementation Complete** ✅

---

## 5-Minute Setup

### 1. Choose Auth Method
- **Trusted Publisher** (recommended): Zero secrets, go to PyPI settings
- **API Token**: Create at pypi.org, add to GitHub Secrets

### 2. Check Workflow
```bash
git ls-files .github/workflows/publish.yml
# Should exist: ✅
```

### 3. Test Locally
```bash
bash scripts/test-version-workflow.sh
# All tests should pass ✅
```

### 4. Deploy
```bash
git push origin main
```

---

## Automatic Publishing

When you push to main:
1. Workflow detects version change
2. Creates git tag (ydk-v0.5.0)
3. Publishes to PyPI + GitHub
4. Updates Obsidian vault
5. Done! 🎉

---

## Manual Trigger

Actions → YDK Version Auto-Publish → Run workflow

---

## Verify Success

```bash
git tag -l 'ydk-v*'           # Check tag
pip index versions yd-utility-kit  # Check PyPI
gh release list | grep ydk    # Check GitHub Release
```

---

## Next: Phase 3

Configure PyPI Trusted Publisher for maximum security (zero tokens).

---

Files:
- `.github/workflows/publish.yml` - Main workflow
- `docs/CI_CD_SETUP_GUIDE.md` - Full guide
- `scripts/test-version-workflow.sh` - Test script
