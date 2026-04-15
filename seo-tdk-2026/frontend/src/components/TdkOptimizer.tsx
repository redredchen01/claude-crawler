/**
 * TdkOptimizer Component
 *
 * Main UI component for TDK (Title/Description/Keywords) optimization
 * Integrated into Phase 6 contentPlan editor
 */

import React, { useState } from "react";
import { useTdkOptimizer, type TdkCandidate } from "../hooks/useTdkOptimizer";
import { useFeedbackSubmission } from "../hooks/useFeedbackSubmission";
import { SerpPreview } from "./SerpPreview";
import "./TdkOptimizer.css";

/**
 * Props for TdkOptimizer component
 */
export interface TdkOptimizerProps {
  /**
   * Project ID for API calls
   */
  projectId: string;

  /**
   * Content plan / cluster ID for saving
   */
  clusterId: string;

  /**
   * Optional initial values
   */
  initialTopic?: string;
  initialKeywords?: string[];
  initialContentSnippet?: string;
  initialLanguage?: "en" | "zh";

  /**
   * Callback when TDK is saved
   */
  onSave?: (tdk: TdkCandidate) => void;

  /**
   * CSS class name for styling
   */
  className?: string;
}

/**
 * Validation status badge component
 */
function ValidationBadge({ status }: { status: "pass" | "warn" | "fail" }) {
  const icons = {
    pass: "✓",
    warn: "⚠",
    fail: "✗",
  };

  return (
    <span className={`validation-badge validation-${status}`}>
      {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/**
 * TDK Candidate Card component
 */
function TdkCandidateCard({
  candidate,
  validation,
  isSelected,
  onSelect,
  onEdit,
  language = "en",
}: {
  candidate: TdkCandidate;
  validation: {
    severity: "pass" | "warn" | "fail";
    issues: Array<{ field: string; message: string; severity: string }>;
  };
  isSelected: boolean;
  onSelect: () => void;
  onEdit: (candidate: TdkCandidate) => void;
  language?: "en" | "zh";
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState(candidate);

  const handleEdit = () => {
    onEdit(editedCandidate);
    setIsEditing(false);
  };

  return (
    <div className={`tdk-candidate-card ${isSelected ? "selected" : ""}`}>
      {/* Selection radio */}
      <div className="candidate-header">
        <input
          type="radio"
          name="tdk-selection"
          checked={isSelected}
          onChange={onSelect}
          className="candidate-radio"
        />
        <div className="candidate-status">
          <ValidationBadge status={validation.severity} />
        </div>
      </div>

      {!isEditing ? (
        <>
          {/* Display mode */}
          <div className="candidate-content">
            <div className="field">
              <label className="field-label">Title</label>
              <p className="field-value">{candidate.title}</p>
              <span className="field-length">
                {candidate.title.length} characters
              </span>
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <p className="field-value">{candidate.description}</p>
              <span className="field-length">
                {candidate.description.length} characters
              </span>
            </div>

            <div className="field">
              <label className="field-label">Keywords</label>
              <div className="keywords-display">
                {candidate.keywords.map((kw, idx) => (
                  <span key={idx} className="keyword-tag">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Validation issues */}
          {validation.issues.length > 0 && (
            <div className="validation-issues">
              <p className="issues-title">Issues</p>
              <ul>
                {validation.issues.map((issue, idx) => (
                  <li key={idx} className={`issue-${issue.severity}`}>
                    <strong>{issue.field}:</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* SERP Preview */}
          <details open className="serp-preview-section">
            <summary className="serp-preview-title">
              🔍 Search Result Preview
            </summary>
            <SerpPreview
              title={candidate.title}
              description={candidate.description}
              language={language}
            />
          </details>

          {/* Actions */}
          <div className="candidate-actions">
            <button
              className="btn-edit"
              onClick={() => {
                setEditedCandidate({ ...candidate });
                setIsEditing(true);
              }}
            >
              Edit
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Edit mode */}
          <div className="candidate-edit">
            <div className="field">
              <label className="field-label">Title</label>
              <input
                type="text"
                value={editedCandidate.title}
                onChange={(e) =>
                  setEditedCandidate({
                    ...editedCandidate,
                    title: e.target.value,
                  })
                }
                className="field-input"
              />
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <textarea
                value={editedCandidate.description}
                onChange={(e) =>
                  setEditedCandidate({
                    ...editedCandidate,
                    description: e.target.value,
                  })
                }
                className="field-textarea"
                rows={3}
              />
            </div>

            <div className="field">
              <label className="field-label">Keywords (comma-separated)</label>
              <input
                type="text"
                value={editedCandidate.keywords.join(", ")}
                onChange={(e) =>
                  setEditedCandidate({
                    ...editedCandidate,
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter((k) => k),
                  })
                }
                className="field-input"
              />
            </div>
          </div>

          {/* Edit actions */}
          <div className="edit-actions">
            <button className="btn-save" onClick={handleEdit}>
              Save
            </button>
            <button
              className="btn-cancel"
              onClick={() => {
                setIsEditing(false);
                setEditedCandidate(candidate);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Main TdkOptimizer component
 */
export const TdkOptimizer: React.FC<TdkOptimizerProps> = ({
  projectId,
  clusterId,
  initialTopic = "",
  initialKeywords = [],
  initialContentSnippet = "",
  initialLanguage = "en",
  onSave,
  className = "",
}) => {
  const hook = useTdkOptimizer(projectId, clusterId);
  const feedbackHook = useFeedbackSubmission(clusterId, projectId);

  // Initialize with props
  React.useEffect(() => {
    if (initialTopic) hook.setTopic(initialTopic);
    if (initialKeywords.length > 0) hook.setKeywords(initialKeywords);
    if (initialContentSnippet) hook.setContentSnippet(initialContentSnippet);
    if (initialLanguage !== "en") hook.setLanguage(initialLanguage);
  }, []);

  const handleSave = async () => {
    if (hook.editingCandidate) {
      await hook.saveTdk();
      if (onSave && !hook.saveError) {
        onSave(hook.editingCandidate);
      }
    }
  };

  const handleKeywordInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    input: string,
    setInput: (v: string) => void,
  ) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      hook.addKeyword(input);
      setInput("");
    }
  };

  const [keywordInput, setKeywordInput] = useState("");

  return (
    <div className={`tdk-optimizer ${className}`}>
      {/* Input Section */}
      <div className="input-section">
        <h3 className="section-title">Input Information</h3>

        {/* Topic input */}
        <div className="form-group">
          <label className="form-label">
            Page Topic <span className="required">*</span>
          </label>
          <input
            type="text"
            value={hook.topic}
            onChange={(e) => hook.setTopic(e.target.value)}
            placeholder="e.g., Python programming tutorial"
            className="form-input"
            maxLength={200}
          />
          <span className="form-hint">{hook.topic.length}/200</span>
        </div>

        {/* Keywords input */}
        <div className="form-group">
          <label className="form-label">Primary Keywords</label>
          <div className="keywords-input">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) =>
                handleKeywordInputKeyDown(e, keywordInput, setKeywordInput)
              }
              placeholder="Type and press Enter to add"
              className="form-input"
            />
            <button
              className="btn-add-keyword"
              onClick={() => {
                hook.addKeyword(keywordInput);
                setKeywordInput("");
              }}
            >
              Add
            </button>
          </div>
          <div className="keywords-list">
            {hook.keywords.map((kw, idx) => (
              <span key={idx} className="keyword-tag-removable">
                {kw}
                <button
                  className="btn-remove-keyword"
                  onClick={() => hook.removeKeyword(idx)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Content snippet */}
        <div className="form-group">
          <label className="form-label">Page Content (optional)</label>
          <textarea
            value={hook.contentSnippet}
            onChange={(e) => hook.setContentSnippet(e.target.value)}
            placeholder="Paste a summary or excerpt of your page content for consistency checking"
            className="form-textarea"
            rows={3}
          />
        </div>

        {/* Language selection */}
        <div className="form-group">
          <label className="form-label">Language</label>
          <select
            value={hook.language}
            onChange={(e) => hook.setLanguage(e.target.value as "en" | "zh")}
            className="form-select"
          >
            <option value="en">English</option>
            <option value="zh">中文 (Chinese)</option>
          </select>
        </div>

        {/* Generate button */}
        <button
          className={`btn-generate ${hook.isGenerating ? "loading" : ""}`}
          onClick={() => hook.generate()}
          disabled={hook.isGenerating || !hook.topic.trim()}
        >
          {hook.isGenerating ? "Generating..." : "Generate Recommendations"}
        </button>

        {/* Error message */}
        {hook.generationError && (
          <div className="error-message">
            <strong>Error:</strong> {hook.generationError}
          </div>
        )}
      </div>

      {/* Results Section */}
      {hook.generationResult && (
        <div className="results-section">
          <h3 className="section-title">Recommendations</h3>

          {/* Primary candidate */}
          <div className="candidates-group">
            <h4 className="group-title">Primary Recommendation</h4>
            <TdkCandidateCard
              candidate={hook.generationResult.primary.candidate}
              validation={hook.generationResult.primary.validation}
              isSelected={hook.selectedCandidateIndex === -1}
              onSelect={() => hook.selectCandidate(-1)}
              onEdit={(candidate) => hook.startEditing(candidate)}
              language={hook.language}
            />
          </div>

          {/* Alternatives */}
          {hook.generationResult.alternatives.length > 0 && (
            <div className="candidates-group">
              <h4 className="group-title">Alternatives</h4>
              {hook.generationResult.alternatives.map((alt, idx) => (
                <TdkCandidateCard
                  key={idx}
                  candidate={alt.candidate}
                  validation={alt.validation}
                  isSelected={hook.selectedCandidateIndex === idx}
                  onSelect={() => hook.selectCandidate(idx)}
                  onEdit={(candidate) => hook.startEditing(candidate)}
                  language={hook.language}
                />
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="metadata">
            <p className="metadata-item">
              Generated:{" "}
              {new Date(
                hook.generationResult.metadata.generatedAt,
              ).toLocaleString()}
            </p>
            <p className="metadata-item">
              Tokens used: {hook.generationResult.metadata.tokensUsed}
            </p>
          </div>

          {/* Clear button */}
          <button className="btn-clear" onClick={() => hook.clearGeneration()}>
            Clear Results
          </button>

          {/* Feedback Section */}
          <div className="feedback-section">
            <h4>How helpful was this recommendation?</h4>
            <div className="feedback-buttons">
              <button
                className={`btn-feedback btn-positive ${feedbackHook.isSubmitted ? "disabled" : ""}`}
                onClick={() =>
                  feedbackHook.submitFeedback({
                    type: "positive",
                  })
                }
                disabled={feedbackHook.isSubmitted || feedbackHook.isSubmitting}
              >
                👍 Helpful
              </button>
              <button
                className={`btn-feedback btn-negative ${feedbackHook.isSubmitted ? "disabled" : ""}`}
                onClick={() =>
                  feedbackHook.submitFeedback({
                    type: "negative",
                  })
                }
                disabled={feedbackHook.isSubmitted || feedbackHook.isSubmitting}
              >
                👎 Needs Improvement
              </button>
            </div>
            {feedbackHook.isSubmitted && (
              <div className="feedback-success">
                ✓ Thank you for your feedback!
              </div>
            )}
            {feedbackHook.error && (
              <div className="feedback-error">Error: {feedbackHook.error}</div>
            )}
          </div>
        </div>
      )}

      {/* Editing Mode */}
      {hook.isEditing && hook.editingCandidate && (
        <div className="editing-overlay">
          <div className="editing-panel">
            <h3>Edit TDK</h3>

            <div className="editing-form">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={hook.editingCandidate.title}
                  onChange={(e) =>
                    hook.updateEditingCandidate({ title: e.target.value })
                  }
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={hook.editingCandidate.description}
                  onChange={(e) =>
                    hook.updateEditingCandidate({ description: e.target.value })
                  }
                  className="form-textarea"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>Keywords</label>
                <input
                  type="text"
                  value={hook.editingCandidate.keywords.join(", ")}
                  onChange={(e) =>
                    hook.updateEditingCandidate({
                      keywords: e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter((k) => k),
                    })
                  }
                  className="form-input"
                />
              </div>
            </div>

            <div className="editing-actions">
              <button
                className="btn-save-large"
                onClick={handleSave}
                disabled={hook.isSaving}
              >
                {hook.isSaving ? "Saving..." : "Save TDK"}
              </button>
              <button
                className="btn-cancel-large"
                onClick={() => hook.cancelEditing()}
              >
                Cancel
              </button>
            </div>

            {hook.saveError && (
              <div className="error-message">{hook.saveError}</div>
            )}
            {hook.saveSuccess && (
              <div className="success-message">TDK saved successfully!</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TdkOptimizer;
