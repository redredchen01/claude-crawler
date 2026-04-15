# TDK Optimizer - User Guide

## For Content Editors

### What is TDK Optimizer?

TDK Optimizer is a tool that automatically generates and validates **Title**, **Description**, and **Keywords** (TDK) for your web pages. It helps you create SEO-friendly metadata quickly and consistently.

### Why Use TDK Optimizer?

- ⚡ **Save Time**: Generate optimal TDK in seconds instead of minutes
- ✓ **Quality Assurance**: Automatic validation catches common SEO mistakes
- 🎯 **Consistency**: Follow established SEO best practices automatically
- 🔄 **Flexibility**: Generate multiple options and choose the best one

### Quick Start (2 Minutes)

#### Step 1: Open the TDK Optimizer Panel
In your content plan editor, scroll down to find the **TDK Optimizer** panel.

#### Step 2: Enter Basic Information
Fill in the following fields:

| Field | Required | Example |
|-------|----------|---------|
| **Page Topic** | ✅ Yes | "Python programming tutorial" |
| **Primary Keywords** | ❌ No | Python, tutorial, beginners |
| **Page Content** | ❌ No | Paste your article summary (improves accuracy) |
| **Language** | ✅ Yes | English or 中文 (Chinese) |

#### Step 3: Click "Generate Recommendations"
The tool will generate:
- **Primary recommendation** — the best option
- **2-3 Alternative options** — for comparison

#### Step 4: Review & Select
Each generated TDK shows:
- ✅ **Green checkmark** — Passes all validation rules
- ⚠️ **Yellow warning** — Minor issues (can still use)
- ✗ **Red X** — Major problems (needs editing)

#### Step 5: Save or Edit
- **Select & Save**: Click the radio button to select a recommendation, then click "Save TDK"
- **Edit First**: Click "Edit" to customize title, description, or keywords before saving

### Understanding Validation Status

After generation, each TDK candidate shows a **status badge**:

#### ✅ PASS
- Title and description meet length standards
- No keyword stacking or repetition
- Content is consistent with page topic

**Action**: Safe to use immediately

#### ⚠️ WARN
- Title or description slightly longer/shorter than optimal
- Minor keyword density issues
- Partial content consistency

**Action**: Can use, but consider editing for better SEO

#### ✗ FAIL
- Title or description too short/long (will be cut off in search results)
- Keyword stacking detected
- Major inconsistency with page content

**Action**: Must edit before publishing

### Example: Step-by-Step

**Input:**
- Topic: "How to Learn Python in 30 Days"
- Keywords: Python, learning, beginners
- Language: English

**Generated Primary Recommendation:**
```
Title: How to Learn Python in 30 Days: Beginner Guide
Description: Master Python programming in just 30 days. Complete beginner guide with 
practical examples, exercises, and best practices.
Keywords: Python, learning, beginners, programming, guide

Status: ✅ PASS
- Title: 58 chars (optimal 50-60) ✓
- Description: 155 chars (optimal 150-160) ✓
- No keyword stacking ✓
```

**Generated Alternative 1:**
```
Title: 30-Day Python Learning Path for Beginners
Description: Learn Python step-by-step over 30 days. Beginner-friendly tutorial with 
hands-on coding exercises and expert tips.
Keywords: Python, beginners, learning, tutorial, 30-day

Status: ✅ PASS
```

**Generated Alternative 2:**
```
Title: Python Tutorial: Complete 30-Day Learning Guide
Description: Start your Python journey today with our comprehensive 30-day tutorial. 
Perfect for absolute beginners in programming.
Keywords: Python, tutorial, beginners, learning, programming

Status: ⚠️ WARN (slightly long: 165 chars)
```

### Editing Tips

If you select a recommendation but want to customize it:

1. Click **Edit** on any TDK card
2. Modify title, description, or keywords
3. Click **Save** to confirm

**Pro Tips:**
- Keep title 50-60 characters (English) or 25-30 characters (Chinese)
- Include primary keyword in first half of title
- Describe page benefit in description
- Use 5-8 keywords, separated by commas

### FAQs

**Q: Why is my generated TDK marked as "WARN"?**
A: It passes basic requirements but could be optimized. For example, the title might be slightly longer than ideal. You can either:
- Use it as-is (it's still good)
- Click "Edit" to shorten it
- Generate new recommendations by clicking "Clear Results"

**Q: Can I use multiple keywords that are very similar?**
A: Avoid it. The tool detects keyword stacking (repetition). Use diverse keywords instead:
- ❌ Bad: "Python, Python programming, learn Python"
- ✅ Good: "Python, programming, tutorial, beginners"

**Q: What if I don't provide page content?**
A: The tool will still generate TDK based on your topic and keywords, but won't check consistency with page content. For best results, paste at least a summary.

**Q: Can I regenerate if I don't like the options?**
A: Yes! Click "Clear Results" and adjust your inputs (topic, keywords, or language), then "Generate Recommendations" again.

**Q: How are Chinese and English rules different?**
A: 
- **English Title**: 50-60 characters optimal
- **Chinese Title**: 25-30 characters optimal (since each Chinese character takes more visual space)

The tool automatically switches validation rules based on your selected language.

---

## For SEO Specialists

### Review & Approval Workflow

As an SEO specialist, you can use TDK Optimizer to review and approve content editor submissions:

#### Workflow:
1. Editor generates TDK using the tool
2. Editor submits for your review
3. You review the recommendation status:
   - ✅ PASS → Approve directly
   - ⚠️ WARN → Review and provide feedback
   - ✗ FAIL → Request editor to regenerate

#### Key Metrics to Check:

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Title Length (EN) | 50-60 | 40-50 or 60-70 | <30 or >80 |
| Description (EN) | 150-160 | 130-150 or 160-180 | <100 or >200 |
| Keyword Repetition | 1-2x | 2x | 3+ |
| Content Match | 80%+ | 60-80% | <60% |

#### Batch Review:
The tool generates multiple options so you can:
1. Compare effectiveness across candidates
2. Discuss trade-offs (CTR-focused vs ranking-focused alternatives)
3. Make data-driven selection decisions

#### Providing Feedback:
If recommending edits, reference:
- **Field**: Which field has the issue (title, description, keywords)
- **Issue**: Specific problem (too long, keyword stacking, etc.)
- **Suggestion**: What to fix

Example:
> Title: "How to Learn Python in 30 Days: Complete Beginner's Guide to Programming Fundamentals"
> Issue: Too long (82 chars) — will be truncated in search results
> Suggestion: Remove "to Programming Fundamentals" → "How to Learn Python in 30 Days: Beginner's Guide"

### Advanced Features (Coming Soon)

- **Batch Processing**: Upload CSV to generate TDK for multiple pages
- **Competitor Analysis**: Compare your TDK with top-ranking competitors
- **SERP Preview**: See how your TDK appears in Google search results
- **Trend Analysis**: Identify rising keywords to include

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Generate | `Ctrl+Enter` (or `Cmd+Enter` on Mac) |
| Save | `Ctrl+S` |
| Edit selected | `E` |
| Clear results | `Ctrl+Shift+C` |

---

## Getting Help

**Common Issues:**

| Issue | Solution |
|-------|----------|
| "Generation failed" | Check your internet connection, try again in a few seconds |
| API timeout | Content snippet too long? Reduce it and retry |
| Validation seems wrong | Refresh the page and try generating again |

**Contact Support:**
- Slack: #tdk-optimizer-support
- Email: tdk-optimizer@company.com
- Docs: See TDK_OPTIMIZER_ARCHITECTURE.md for technical details

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-15 | Initial release: Generation, validation, storage |
| 1.1 | TBD | Batch processing, competitor analysis |
| 1.2 | TBD | SERP preview, trend integration |

---

Last updated: 2026-04-15
