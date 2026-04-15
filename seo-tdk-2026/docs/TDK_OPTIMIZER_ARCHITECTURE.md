# TDK Optimizer - Architecture & Technical Design

## System Overview

TDK Optimizer is a 6-unit system integrated into Phase 6 (SEO Content System):

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Unit 5)                         │
│  React Components: TdkOptimizer, TdkCandidateCard           │
│  Custom Hook: useTdkOptimizer (state management)            │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API
┌────────────────────┴────────────────────────────────────────┐
│                  Backend (Units 2-4)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ API Routes (Unit 4)                                  │   │
│  │ POST /tdk-optimize, POST /tdk-save, GET /tdk        │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────┴─────────────────────────────────────┐   │
│  │ Services (Unit 2)                                    │   │
│  │ TdkGeneratorService (Claude API calls)              │   │
│  │ TdkValidatorService (Rule application)              │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────┴─────────────────────────────────────┐   │
│  │ Rules Engine (Unit 1)                                │   │
│  │ tdkRules.ts: Length, stacking, consistency checks    │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│             Database (Unit 3)                                │
│  contentPlans table (extended with TDK fields)              │
│  tdk_json: AI-generated recommendations                    │
│  user_tdk_json: User edits (data separation)              │
│  tdkValidations: Cached validation results                │
└─────────────────────────────────────────────────────────────┘
```

## Unit 1: TDK Rules Engine

**File**: `backend/src/services/tdk/tdkRules.ts`

### Core Functions

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `validateTitleLength()` | Check title meets length standards | title, language | LengthCheckResult |
| `validateDescriptionLength()` | Check description length | description, language | LengthCheckResult |
| `detectKeywordStacking()` | Find repeated or dense keywords | text, keywords, language | StackingCheckResult |
| `checkContentConsistency()` | Verify alignment with page content | title+desc, content, language | ConsistencyCheckResult |
| `validate()` | Run all checks comprehensively | title, desc, content, language | ValidationResult |

### Configuration

Rules are externalized via environment variables:

```env
# Title length thresholds (characters/Chinese characters)
TITLE_LENGTH_MIN_EN=30
TITLE_LENGTH_OPTIMAL_MIN_EN=50
TITLE_LENGTH_OPTIMAL_MAX_EN=60
TITLE_LENGTH_MAX_EN=70

TITLE_LENGTH_MIN_ZH=15
TITLE_LENGTH_OPTIMAL_MIN_ZH=25
TITLE_LENGTH_OPTIMAL_MAX_ZH=30
TITLE_LENGTH_MAX_ZH=40

# Stacking detection thresholds
STACKING_REPEAT_THRESHOLD=3  # Fail if keyword repeats N+ times
STACKING_DENSITY_WARN=0.15   # Warn if keyword density > 15%
STACKING_DENSITY_FAIL=0.25   # Fail if keyword density > 25%

# Consistency checking
CONSISTENCY_COVERAGE_PASS=0.80   # Pass if 80%+ content words covered
CONSISTENCY_COVERAGE_WARN=0.60   # Warn if 60-80% coverage
```

### Extensibility

To modify rules **without code changes**:
1. Update `.env` file with new thresholds
2. No recompilation needed (values read at runtime)
3. Effects apply immediately

To **add new validation types** (code change required):
1. Add function in `tdkRules.ts`
2. Export result interface
3. Call from `TdkValidatorService`
4. Update tests and documentation

---

## Unit 2: Generation & Validation Services

### TdkGeneratorService

**File**: `backend/src/services/tdk/tdkGeneratorService.ts`

**Responsibilities:**
- Call Claude API with formatted prompt
- Generate primary + 2-3 alternative recommendations
- Parse and validate JSON response
- Attach metadata (timestamp, tokens, model version)

**Key Methods:**

```typescript
async generateRecommendations(
  topic: string,
  keywords: string[],
  contentSnippet?: string,
  language: 'en' | 'zh'
): Promise<TdkGenerationResult>
```

**Flow:**
```
Input validation
  ↓
Build Claude prompt (topic, keywords, content, language)
  ↓
Call Claude API (claude-opus-4-6, max_tokens=1500)
  ↓
Extract JSON from response
  ↓
Parse into candidates (primary + alternatives)
  ↓
Return with metadata (timestamp, tokens, version)
```

**Error Handling:**
- Validation errors → thrown immediately
- API timeouts → caught, wrapped, returned as error
- Invalid JSON → parsed safely with detailed error messages
- Malformed candidates → validation per-candidate

### TdkValidatorService

**File**: `backend/src/services/tdk/tdkValidatorService.ts`

**Responsibilities:**
- Apply rules to each TDK candidate
- Generate detailed validation reports
- Rank candidates by validity
- Provide actionable suggestions

**Key Methods:**

```typescript
validate(
  candidate: TdkCandidate,
  contentSnippet: string | undefined,
  language: 'en' | 'zh'
): TdkValidationReport

validateBatch(
  candidates: TdkCandidate[],
  contentSnippet: string | undefined,
  language: 'en' | 'zh'
): TdkValidationReport[]

getBestCandidate(
  candidates: TdkCandidate[],
  contentSnippet: string | undefined,
  language: 'en' | 'zh'
): { candidate: TdkCandidate; report: TdkValidationReport }
```

**Selection Algorithm:**
1. Rank by severity (pass > warn > fail)
2. If tied, rank by issue count (fewer is better)
3. Return candidate with best rank

---

## Unit 3: Database Schema

**File**: `backend/src/db/schema.ts`

### New Fields on `contentPlans` Table

| Field | Type | Nullable | Purpose |
|-------|------|----------|---------|
| `tdkJson` | TEXT (JSON) | Yes | AI-generated TDK (immutable) |
| `userTdkJson` | TEXT (JSON) | Yes | User edits (mutable) |
| `tdkValidations` | TEXT (JSON) | Yes | Cached validation results |
| `tdkGeneratedAt` | TEXT | Yes | Timestamp of generation |
| `tdkLanguage` | TEXT | Yes | Language ('en' or 'zh') |
| `tdkInputJson` | TEXT (JSON) | Yes | Original input (for regeneration) |
| `tdkGenerationCount` | INTEGER | No | Number of times regenerated |

### Data Separation Pattern

**Principle**: Never overwrite AI-generated data; always keep both versions.

```typescript
// When user edits a generated TDK:
{
  tdkJson: {
    // Original AI output — NEVER modified
    primary: { title: "AI Title", ... },
    alternatives: [...],
    metadata: { ... }
  },
  userTdkJson: {
    // User edits — separate storage
    title: "User's Custom Title",
    editedAt: "2026-04-15T10:30:00Z"
  }
}
```

**Benefits:**
- Undo/regenerate always possible
- Audit trail maintained
- Can compare original vs final
- User can revert to original anytime

### Audit Table: `tdk_generation_history`

Stores each generation attempt:

```typescript
{
  id: "hist-123",
  contentPlanId: "plan-456",
  projectId: "proj-1",
  
  // Input
  topic: "Python tutorial",
  keywords: ["Python", "tutorial"],
  contentSnippet: "...",
  language: "en",
  
  // Output
  generatedTdk: { ... },
  totalTokensUsed: 500,
  
  // Status
  status: "success",
  
  // Metadata
  modelVersion: "claude-opus-4-6",
  generatedAt: "2026-04-15T10:30:00Z",
  generatedBy: "user-id-123",
  
  // Optional: approval tracking
  wasApproved: 1,
  approvedAt: "2026-04-15T11:00:00Z",
  approvedBy: "seo-expert-id"
}
```

---

## Unit 4: API Endpoints

**File**: `backend/src/api/tdk.ts`

### POST `/api/projects/{projectId}/tdk-optimize`

**Purpose**: Generate TDK recommendations

**Request:**
```json
{
  "topic": "Python programming tutorial",
  "keywords": ["Python", "tutorial", "beginners"],
  "contentSnippet": "Optional page content...",
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "primary": {
      "candidate": { "title": "...", "description": "...", "keywords": [...] },
      "validation": { "severity": "pass", "issues": [] }
    },
    "alternatives": [
      { "candidate": {...}, "validation": {...} },
      { "candidate": {...}, "validation": {...} }
    ],
    "metadata": {
      "generatedAt": "2026-04-15T10:30:00Z",
      "language": "en",
      "modelVersion": "claude-opus-4-6",
      "tokensUsed": 500
    }
  }
}
```

**Error Handling:**
- 400: Validation error (missing topic, invalid language)
- 500: API error (Claude timeout, parsing failure)

### POST `/api/projects/{projectId}/clusters/{clusterId}/tdk-save`

**Purpose**: Save user-edited TDK

**Request:**
```json
{
  "userTdkJson": {
    "title": "User's Edited Title",
    "description": "User's Description",
    "keywords": ["user", "keywords"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contentPlanId": "cluster-123",
    "userTdkJson": {
      "title": "User's Edited Title",
      "description": "User's Description",
      "keywords": ["user", "keywords"],
      "editedAt": "2026-04-15T10:35:00Z"
    }
  }
}
```

### GET `/api/projects/{projectId}/clusters/{clusterId}/tdk`

**Purpose**: Retrieve current TDK state

**Response:**
```json
{
  "success": true,
  "data": {
    "contentPlanId": "cluster-123",
    "tdkJson": { ... },
    "userTdkJson": { ... },
    "tdkValidations": { ... },
    "tdkGeneratedAt": "2026-04-15T10:30:00Z"
  }
}
```

---

## Unit 5: Frontend Components

**Files:**
- `frontend/src/components/TdkOptimizer.tsx` — Main component
- `frontend/src/hooks/useTdkOptimizer.ts` — State management hook
- `frontend/src/components/TdkOptimizer.css` — Styles

### Component Structure

```
TdkOptimizer (main component)
  ├── Input Section
  │   ├── Topic input
  │   ├── Keywords manager (add/remove)
  │   ├── Content snippet textarea
  │   ├── Language selector
  │   └── Generate button
  │
  ├── Results Section (if generated)
  │   ├── Primary Candidate Card
  │   │   ├── Display mode
  │   │   │   ├── Title display
  │   │   │   ├── Description display
  │   │   │   ├── Keywords display
  │   │   │   ├── Validation status
  │   │   │   └── Edit button
  │   │   └── Edit mode
  │   │       ├── Title input
  │   │       ├── Description textarea
  │   │       ├── Keywords input
  │   │       └── Save/Cancel buttons
  │   │
  │   └── Alternative Candidate Cards (same structure)
  │
  └── Editing Overlay (if in edit mode)
      ├── Edit form
      ├── Save/Cancel buttons
      └── Status messages
```

### useTdkOptimizer Hook

**State:**
```typescript
interface UseTdkOptimizerState {
  // Input
  topic: string;
  keywords: string[];
  contentSnippet: string;
  language: 'en' | 'zh';

  // Generation
  isGenerating: boolean;
  generationError: string | null;
  generationResult: TdkGenerationResult | null;

  // UI
  selectedCandidateIndex: number | null;
  isEditing: boolean;
  editingCandidate: TdkCandidate | null;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
}
```

**Actions:**
- Input: `setTopic`, `setKeywords`, `addKeyword`, `removeKeyword`, `setContentSnippet`, `setLanguage`
- Generation: `generate`, `clearGeneration`
- Selection: `selectCandidate`
- Editing: `startEditing`, `updateEditingCandidate`, `cancelEditing`
- Saving: `saveTdk`, `clearSaveStatus`
- Management: `reset`

---

## Unit 6: Testing & Documentation

### Test Coverage

| Unit | Tests | Coverage |
|------|-------|----------|
| Rules (Unit 1) | 50+ | Length, stacking, consistency, edge cases |
| Services (Unit 2) | 40+ | Generation, validation, batch processing |
| Database (Unit 3) | 30+ | Schema, data separation, migrations |
| API (Unit 4) | 30+ | Routes, validation, error handling |
| Frontend (Unit 5) | 30+ | Hook, component, interactions |
| E2E (Unit 6) | 10+ | Full workflows, error recovery |

### Running Tests

```bash
# All tests
npm test

# Specific unit
npm test -- tdkRules.test.ts
npm test -- tdkServices.test.ts
npm test -- contentPlans.test.ts
npm test -- tdk.test.ts
npm test -- TdkOptimizer.test.tsx

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## Performance Considerations

### Generation Latency

- Claude API call: 2-3 seconds (typical)
- JSON parsing: <10ms
- Total: ~2-3 seconds

**Optimization**: Cache results by (topic, keywords) hash for 60 minutes (configurable)

### Database

- `tdkJson` fields are JSON, searchable via SQL functions
- Indexes on `tdkGeneratedAt`, `tdkLanguage` for quick lookups
- No N+1 queries (batch validation provided)

### Frontend

- `useTdkOptimizer` is lightweight (useState, useCallback)
- No Redux/heavy state management required
- Lazy load editor panel via React.lazy()

---

## Security & Privacy

### Input Validation

- Topic: max 200 characters
- Keywords: max 20 items, each <100 chars
- Content snippet: max 10,000 characters

### API Authentication

- All endpoints require project access verification (TODO: implement `verifyProjectAccess`)
- User can only save to their own contentPlan

### Data Handling

- Claude API calls include no sensitive user data (only topic/keywords/snippet)
- Responses stored in database without PII
- Generation history retained for 90 days (configurable)

---

## Extending the System

### Adding a New Rule

1. Add function to `tdkRules.ts`:
   ```typescript
   export function checkNewRule(...): NewRuleResult {
     // Implementation
   }
   ```

2. Add to `validate()` function:
   ```typescript
   newRule: checkNewRule(...)
   ```

3. Update `ValidationResult` interface
4. Add tests
5. Update documentation

### Supporting a New Language

1. Add stopwords to `STOPWORDS_ZH` or create `STOPWORDS_FR`
2. Add language-specific rules to `TDK_CONFIG`:
   ```typescript
   title: {
     fr: {
       min: 40,
       optimalMin: 55,
       optimalMax: 65,
       max: 80,
     }
   }
   ```
3. Update Claude Prompt to include language-specific guidance
4. Add tests with sample French content
5. Update user guide

### Customizing the UI

Modify `TdkOptimizer.css` for styling or `TdkOptimizer.tsx` for structure. All components use semantic HTML for accessibility.

---

## Monitoring & Debugging

### Key Metrics

```
tdk_generation_duration_ms      # How long generation takes
tdk_validation_errors           # Validation failures
tdk_save_failures               # Save endpoint errors
tdk_api_timeout_count           # Claude API timeouts
tdk_cache_hit_rate              # Generation cache hits
```

### Debug Flags

```env
DEBUG=tdk:*         # Verbose logging
TDK_MOCK_API=true   # Use mock Claude responses
```

### Logging

Services emit structured logs:
```json
{
  "service": "TdkGeneratorService",
  "action": "generate",
  "projectId": "proj-1",
  "duration_ms": 2500,
  "status": "success",
  "tokensUsed": 500
}
```

---

Last updated: 2026-04-15
