/**
 * Cluster Detail View Component
 * Phase 3.3: Display cluster information with keywords and planning overview
 */

import React, { useState } from "react";
import type {
  Cluster,
  KeywordFeature,
  ContentBrief,
  FAQPage,
  InternalLinkSuggestions,
} from "../types/api";
import { TrendIndicator } from "./TrendIndicator";
import {
  useContentPlan,
  useGenerateContentPlan,
  usePatchContentPlan,
} from "../hooks/useContentPlan";

interface ClusterDetailViewProps {
  clusterId: string;
  cluster: Cluster;
  contentPlan?: {
    brief: ContentBrief | null;
    faq: FAQPage | null;
    links: InternalLinkSuggestions | null;
  };
  keywords?: KeywordFeature[];
  onClose?: () => void;
  onGenerateContent?: (clusterId: string) => Promise<void>;
  isLoading?: boolean;
}

export const ClusterDetailView: React.FC<ClusterDetailViewProps> = ({
  clusterId,
  cluster,
  contentPlan: _contentPlan,
  keywords = [],
  onClose,
  onGenerateContent: _onGenerateContent,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "keywords" | "plan">(
    "overview",
  );

  // Use new hooks for content plan
  const {
    data: planData,
    isLoading: isPlanLoading,
    error: planError,
  } = useContentPlan(clusterId);
  const generateMutation = useGenerateContentPlan();

  const contentPlan = planData
    ? {
        brief: planData.brief,
        faq: planData.faq,
        links: planData.links,
      }
    : null;

  const handleGenerateContent = async () => {
    try {
      await generateMutation.mutateAsync({ clusterId, force: false });
    } catch (error) {
      console.error("Failed to generate content:", error);
    }
  };

  const handleRegenerate = async () => {
    try {
      await generateMutation.mutateAsync({ clusterId, force: true });
    } catch (error) {
      console.error("Failed to regenerate content:", error);
    }
  };

  return (
    <div className="cluster-detail-view">
      {/* Header */}
      <div className="cluster-header">
        <div className="header-info">
          <h1 className="cluster-title">{cluster.pillarKeyword}</h1>
          <div className="cluster-meta">
            <span className="badge badge-primary">{cluster.pageType}</span>
            <span className="badge badge-secondary">
              Priority: {(cluster.priority * 100).toFixed(0)}%
            </span>
            {cluster.confidenceScore && (
              <span className="badge badge-info">
                Confidence: {(cluster.confidenceScore * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        <div className="header-actions">
          {onGenerateContent && (
            <button
              onClick={handleGenerateContent}
              disabled={isGenerating || isLoading}
              className="btn btn-primary"
            >
              {isGenerating ? "Generating..." : "Generate Content"}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === "keywords" ? "active" : ""}`}
          onClick={() => setActiveTab("keywords")}
        >
          Keywords ({keywords.length})
        </button>
        <button
          className={`tab ${activeTab === "plan" ? "active" : ""}`}
          onClick={() => setActiveTab("plan")}
        >
          Content Plan
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === "overview" && <OverviewTab cluster={cluster} />}
        {activeTab === "keywords" && <KeywordsTab keywords={keywords} />}
        {activeTab === "plan" && (
          <PlanTab
            contentPlan={contentPlan}
            status={planData?.status ?? "pending"}
            generatedAt={planData?.generatedAt}
            isUserEdited={planData?.isUserEdited ?? false}
            editedAt={planData?.editedAt}
            publishedUrl={planData?.publishedUrl}
            publishedAt={planData?.publishedAt}
            notes={planData?.notes}
            isLoading={isPlanLoading}
            onRegenerate={handleRegenerate}
            clusterId={clusterId}
          />
        )}
      </div>
    </div>
  );
};

interface OverviewTabProps {
  cluster: Cluster;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ cluster }) => {
  return (
    <div className="overview-tab">
      <div className="grid grid-2">
        <div className="card">
          <h3>Cluster Metrics</h3>
          <dl className="metric-list">
            <dt>Total Keywords</dt>
            <dd>{cluster.memberCount}</dd>

            <dt>Page Type</dt>
            <dd className="capitalize">{cluster.pageType}</dd>

            <dt>Priority Score</dt>
            <dd>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${cluster.priority * 100}%` }}
                />
              </div>
              {(cluster.priority * 100).toFixed(1)}%
            </dd>

            <dt>Competition Score</dt>
            <dd>{cluster.competitionScore}</dd>

            <dt>Average Search Volume</dt>
            <dd>{cluster.averageSearchVolume?.toLocaleString() || "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Cluster Information</h3>
          <dl className="metric-list">
            <dt>Cluster ID</dt>
            <dd className="monospace">{cluster.id}</dd>

            <dt>Created At</dt>
            <dd>
              {new Date(cluster.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </dd>

            <dt>Keyword Count</dt>
            <dd>{cluster.keywords?.length || 0}</dd>

            {cluster.confidenceScore && (
              <>
                <dt>Confidence Score</dt>
                <dd>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${cluster.confidenceScore * 100}%` }}
                    />
                  </div>
                  {(cluster.confidenceScore * 100).toFixed(1)}%
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};

interface KeywordsTabProps {
  keywords: KeywordFeature[];
}

const KeywordsTab: React.FC<KeywordsTabProps> = ({ keywords }) => {
  const [sortBy, setSortBy] = useState<
    "name" | "intent" | "competition" | "trend"
  >("name");

  const sortedKeywords = [...keywords].sort((a, b) => {
    switch (sortBy) {
      case "intent":
        return (a.intent_primary || "").localeCompare(b.intent_primary || "");
      case "competition":
        return (b.competition_score || 0) - (a.competition_score || 0);
      case "trend":
        return (a.trend_label || "unknown").localeCompare(
          b.trend_label || "unknown",
        );
      default:
        return (a.raw_keyword || "").localeCompare(b.raw_keyword || "");
    }
  });

  return (
    <div className="keywords-tab">
      <div className="keywords-controls">
        <label>
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Keyword Name</option>
            <option value="intent">Intent</option>
            <option value="competition">Competition Score</option>
            <option value="trend">Trend</option>
          </select>
        </label>
      </div>

      <div className="keywords-table">
        <table>
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Intent (Primary)</th>
              <th>Funnel Stage</th>
              <th>Content Type</th>
              <th>Trend</th>
              <th>Competition</th>
            </tr>
          </thead>
          <tbody>
            {sortedKeywords.map((kw) => (
              <tr key={kw.id || kw.raw_keyword}>
                <td className="keyword-cell">
                  <code>{kw.raw_keyword}</code>
                </td>
                <td>
                  <span className="badge">{kw.intent_primary}</span>
                </td>
                <td>
                  <span className="label">{kw.funnel_stage}</span>
                </td>
                <td>
                  <span className="label">
                    {kw.content_format_recommendation}
                  </span>
                </td>
                <td>
                  <TrendIndicator
                    label={kw.trend_label}
                    confidence={kw.trend_confidence}
                    direction={kw.trend_direction}
                  />
                </td>
                <td>
                  <div className="score-indicator">{kw.competition_score}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sortedKeywords.length === 0 && (
          <div className="empty-state">
            <p>No keywords available for this cluster</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface PlanTabProps {
  contentPlan?: {
    brief: ContentBrief | null;
    faq: FAQPage | null;
    links: InternalLinkSuggestions | null;
  };
  status?: "pending" | "generating" | "completed" | "failed";
  generatedAt?: number | null;
  isUserEdited?: boolean;
  editedAt?: number | null;
  publishedUrl?: string | null;
  publishedAt?: number | null;
  notes?: string | null;
  isLoading?: boolean;
  onRegenerate?: () => Promise<void>;
  clusterId?: string;
}

const PlanTab: React.FC<PlanTabProps> = ({
  contentPlan,
  status = "pending",
  generatedAt,
  isUserEdited = false,
  editedAt,
  publishedUrl: initialPublishedUrl,
  publishedAt: initialPublishedAt,
  notes: initialNotes,
  isLoading = false,
  onRegenerate,
  clusterId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBrief, setEditedBrief] = useState<ContentBrief | null>(
    contentPlan?.brief || null,
  );
  const [editedFaq, setEditedFaq] = useState<FAQPage | null>(
    contentPlan?.faq || null,
  );
  const [publishedUrl, setPublishedUrl] = useState(initialPublishedUrl || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const patchMutation = usePatchContentPlan();

  if (isLoading || status === "generating") {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <p>Generating content plan...</p>
      </div>
    );
  }

  if (!contentPlan || status === "pending") {
    return (
      <div className="empty-state">
        <p>No content plan available. Generate content first.</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="empty-state error">
        <p>Failed to generate content plan. Please try again.</p>
      </div>
    );
  }

  const handleSaveChanges = async () => {
    if (!clusterId) return;
    try {
      await patchMutation.mutateAsync({
        clusterId,
        patch: {
          brief: editedBrief,
          faq: editedFaq,
          publishedUrl: publishedUrl || undefined,
          notes: notes || undefined,
        },
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save changes:", error);
    }
  };

  const handleMarkPublished = async () => {
    if (!clusterId) return;
    try {
      await patchMutation.mutateAsync({
        clusterId,
        patch: {
          publishedUrl,
          publishedAt: Math.floor(Date.now() / 1000),
        },
      });
    } catch (error) {
      console.error("Failed to mark as published:", error);
    }
  };

  return (
    <div className="plan-tab">
      {generatedAt && (
        <div className="plan-metadata">
          <div className="metadata-left">
            <span className="generated-at">
              Generated {new Date(generatedAt * 1000).toLocaleDateString()}
            </span>
            {isUserEdited && (
              <>
                <span className="badge badge-edited">Edited</span>
                {editedAt && (
                  <span className="edited-at">
                    {new Date(editedAt * 1000).toLocaleDateString()}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="metadata-right">
            {status === "completed" && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-secondary btn-small"
              >
                Edit Content
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="btn btn-ghost btn-small"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={patchMutation.isPending}
                  className="btn btn-primary btn-small"
                >
                  {patchMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}
            {!isEditing && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="btn btn-secondary btn-small"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      )}

      <div className="plan-sections">
        {editedBrief && (
          <BriefSection
            brief={editedBrief}
            isEditing={isEditing}
            onBriefChange={setEditedBrief}
          />
        )}
        {editedFaq && (
          <FAQSection
            faq={editedFaq}
            isEditing={isEditing}
            onFaqChange={setEditedFaq}
          />
        )}
        {contentPlan.links && <LinksSection links={contentPlan.links} />}
      </div>

      {status === "completed" && (
        <div className="card plan-section publishing-section">
          <h3>Publishing & Notes</h3>
          <div className="publishing-content">
            <div className="publishing-item">
              <label htmlFor="published-url">Published URL</label>
              <input
                id="published-url"
                type="url"
                placeholder="https://example.com/article"
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                disabled={!isEditing && initialPublishedAt}
              />
              {!isEditing && (
                <button
                  onClick={handleMarkPublished}
                  disabled={!publishedUrl || patchMutation.isPending}
                  className="btn btn-secondary btn-small"
                >
                  {initialPublishedAt
                    ? "Update Published"
                    : "Mark as Published"}
                </button>
              )}
            </div>

            {initialPublishedAt && (
              <div className="publishing-item">
                <span className="badge badge-success">
                  Published{" "}
                  {new Date(initialPublishedAt * 1000).toLocaleDateString()}
                </span>
              </div>
            )}

            <div className="publishing-item">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                placeholder="Add notes about this content plan..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isEditing}
                rows={2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface BriefSectionProps {
  brief: ContentBrief;
  isEditing?: boolean;
  onBriefChange?: (brief: ContentBrief) => void;
}

const BriefSection: React.FC<BriefSectionProps> = ({
  brief,
  isEditing = false,
  onBriefChange,
}) => {
  const handleTitleChange = (newTitle: string) => {
    if (onBriefChange) {
      onBriefChange({ ...brief, title: newTitle });
    }
  };

  const handleMetaDescriptionChange = (newDesc: string) => {
    if (onBriefChange) {
      onBriefChange({ ...brief, metaDescription: newDesc });
    }
  };

  const handleOutlineChange = (index: number, newValue: string) => {
    if (onBriefChange) {
      const newOutline = [...(brief.outline || [])];
      newOutline[index] = newValue;
      onBriefChange({ ...brief, outline: newOutline });
    }
  };

  const handleAddOutlineItem = () => {
    if (onBriefChange) {
      onBriefChange({
        ...brief,
        outline: [...(brief.outline || []), "New outline item"],
      });
    }
  };

  const handleRemoveOutlineItem = (index: number) => {
    if (onBriefChange) {
      const newOutline = (brief.outline || []).filter((_, i) => i !== index);
      onBriefChange({ ...brief, outline: newOutline });
    }
  };

  return (
    <div className="card plan-section">
      <h3>Content Brief</h3>
      <div className="brief-content">
        <div className="brief-item">
          <label htmlFor="brief-title">Title</label>
          {isEditing ? (
            <input
              id="brief-title"
              type="text"
              value={brief.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Content title"
            />
          ) : (
            <p className="value">{brief.title}</p>
          )}
        </div>

        <div className="brief-item">
          <label htmlFor="brief-meta">Meta Description</label>
          {isEditing ? (
            <textarea
              id="brief-meta"
              value={brief.metaDescription}
              onChange={(e) => handleMetaDescriptionChange(e.target.value)}
              placeholder="SEO meta description"
              rows={2}
            />
          ) : (
            <p className="value">{brief.metaDescription}</p>
          )}
        </div>

        <div className="brief-item">
          <label>Recommended Length</label>
          <p className="value">
            {brief.contentLength?.target?.toLocaleString()} words
          </p>
        </div>

        {(brief.outline || isEditing) && (
          <div className="brief-item">
            <label>Content Outline</label>
            <div className="outline-list">
              {brief.outline && brief.outline.length > 0 ? (
                brief.outline.map((item, index) => (
                  <div key={index} className="outline-item">
                    {isEditing ? (
                      <div className="outline-edit">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            handleOutlineChange(index, e.target.value)
                          }
                          placeholder={`Outline point ${index + 1}`}
                        />
                        <button
                          onClick={() => handleRemoveOutlineItem(index)}
                          className="btn btn-ghost btn-small"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="outline-text">{item}</span>
                    )}
                  </div>
                ))
              ) : isEditing ? (
                <p className="empty">No outline items yet</p>
              ) : null}
            </div>
            {isEditing && (
              <button
                onClick={handleAddOutlineItem}
                className="btn btn-secondary btn-small"
              >
                Add Outline Item
              </button>
            )}
          </div>
        )}

        {brief.targetKeywords && (
          <div className="brief-item">
            <label>Target Keywords</label>
            <div className="keywords-list">
              {brief.targetKeywords.primary && (
                <div>
                  <span className="kw-type">Primary:</span>
                  {brief.targetKeywords.primary.map((kw) => (
                    <span key={kw} className="keyword-tag">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              {brief.targetKeywords.secondary && (
                <div>
                  <span className="kw-type">Secondary:</span>
                  {brief.targetKeywords.secondary.map((kw) => (
                    <span key={kw} className="keyword-tag secondary">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface FAQSectionProps {
  faq: FAQPage;
  isEditing?: boolean;
  onFaqChange?: (faq: FAQPage) => void;
}

const FAQSection: React.FC<FAQSectionProps> = ({
  faq,
  isEditing = false,
  onFaqChange,
}) => {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
    new Set(),
  );

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedIndices);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedIndices(newExpanded);
  };

  const handleQuestionChange = (index: number, newQuestion: string) => {
    if (onFaqChange) {
      const newFaqs = faq.faqs.map((item, i) =>
        i === index ? { ...item, question: newQuestion } : item,
      );
      onFaqChange({ ...faq, faqs: newFaqs });
    }
  };

  const handleAnswerChange = (index: number, newAnswer: string) => {
    if (onFaqChange) {
      const newFaqs = faq.faqs.map((item, i) =>
        i === index ? { ...item, answer: newAnswer } : item,
      );
      onFaqChange({ ...faq, faqs: newFaqs });
    }
  };

  const handleAddFaq = () => {
    if (onFaqChange) {
      const newFaqs = [
        ...faq.faqs,
        { question: "New question?", answer: "Enter answer here" },
      ];
      onFaqChange({ ...faq, faqs: newFaqs });
    }
  };

  const handleRemoveFaq = (index: number) => {
    if (onFaqChange) {
      const newFaqs = faq.faqs.filter((_, i) => i !== index);
      onFaqChange({ ...faq, faqs: newFaqs });
    }
  };

  return (
    <div className="card plan-section">
      <h3>FAQ Suggestions</h3>
      <div className="faq-content">
        <p className="faq-intro">{faq.introduction}</p>

        <div className="faq-list">
          {faq.faqs && faq.faqs.length > 0 ? (
            faq.faqs.map((item: any, index: number) => (
              <div key={index} className="faq-item">
                {isEditing ? (
                  <div className="faq-edit">
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) =>
                        handleQuestionChange(index, e.target.value)
                      }
                      placeholder="FAQ question"
                      className="faq-question-input"
                    />
                    <textarea
                      value={item.answer}
                      onChange={(e) =>
                        handleAnswerChange(index, e.target.value)
                      }
                      placeholder="FAQ answer"
                      rows={3}
                      className="faq-answer-input"
                    />
                    <button
                      onClick={() => handleRemoveFaq(index)}
                      className="btn btn-ghost btn-small"
                    >
                      Delete FAQ
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="faq-question"
                      onClick={() => toggleExpanded(index)}
                    >
                      <span className="arrow">
                        {expandedIndices.has(index) ? "▼" : "▶"}
                      </span>
                      {item.question}
                    </button>
                    {expandedIndices.has(index) && (
                      <div className="faq-answer">{item.answer}</div>
                    )}
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="empty">No FAQ items available</p>
          )}
        </div>

        {isEditing && (
          <button
            onClick={handleAddFaq}
            className="btn btn-secondary btn-small"
          >
            Add FAQ
          </button>
        )}

        {faq.conclusion && <p className="faq-conclusion">{faq.conclusion}</p>}
      </div>
    </div>
  );
};

interface LinksSectionProps {
  links: InternalLinkSuggestions;
}

const LinksSection: React.FC<LinksSectionProps> = ({ links }) => {
  return (
    <div className="card plan-section">
      <h3>Internal Linking Strategy</h3>
      <div className="links-content">
        <div className="links-group">
          <h4>Outgoing Links ({links.outgoingLinks?.length || 0})</h4>
          <div className="links-list">
            {links.outgoingLinks && links.outgoingLinks.length > 0 ? (
              links.outgoingLinks.map((link: any, index: number) => (
                <div key={index} className="link-item">
                  <div className="link-header">
                    <span className="link-anchor">{link.anchorText}</span>
                    <span className="link-type">{link.type}</span>
                  </div>
                  <p className="link-context">{link.context}</p>
                </div>
              ))
            ) : (
              <p className="empty">No outgoing links suggested</p>
            )}
          </div>
        </div>

        <div className="links-group">
          <h4>Incoming Links ({links.incomingLinks?.length || 0})</h4>
          <p className="help-text">
            Other clusters that should link to this page
          </p>
          <div className="links-list">
            {links.incomingLinks && links.incomingLinks.length > 0 ? (
              links.incomingLinks.map((link: any, index: number) => (
                <div key={index} className="link-item">
                  <div className="link-header">
                    <span className="link-anchor">{link.anchorText}</span>
                  </div>
                  <p className="link-context">{link.context}</p>
                </div>
              ))
            ) : (
              <p className="empty">No incoming links identified</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClusterDetailView;
