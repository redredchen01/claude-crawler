/**
 * SERP Preview Component
 *
 * Displays a mockup of Google search result to preview
 * how Title and Description will appear with truncation
 */

import React, { useMemo } from "react";
import "./SerpPreview.css";

export interface SerpPreviewProps {
  title: string;
  description: string;
  url?: string;
  language: "en" | "zh";
}

const TRUNCATION_RULES = {
  en: { titleMaxChars: 60, descriptionMaxChars: 160 },
  zh: { titleMaxChars: 30, descriptionMaxChars: 80 },
};

function isTruncated(
  text: string,
  maxChars: number,
  language: "en" | "zh",
): boolean {
  return text.length > maxChars;
}

function truncateText(
  text: string,
  maxChars: number,
  language: "en" | "zh",
): string {
  if (text.length > maxChars) {
    return text.substring(0, maxChars) + "...";
  }
  return text;
}

export const SerpPreview: React.FC<SerpPreviewProps> = ({
  title,
  description,
  url = "example.com",
  language,
}) => {
  const rules = TRUNCATION_RULES[language];

  const displayTitle = useMemo(
    () => truncateText(title, rules.titleMaxChars, language),
    [title, rules.titleMaxChars, language],
  );

  const displayDescription = useMemo(
    () => truncateText(description, rules.descriptionMaxChars, language),
    [description, rules.descriptionMaxChars, language],
  );

  const titleIsTruncated = useMemo(
    () => isTruncated(title, rules.titleMaxChars, language),
    [title, rules.titleMaxChars, language],
  );

  const descriptionIsTruncated = useMemo(
    () => isTruncated(description, rules.descriptionMaxChars, language),
    [description, rules.descriptionMaxChars, language],
  );

  return (
    <div className="serp-preview">
      <div className="serp-container">
        <div className="serp-url">{url}</div>
        <div className={`serp-title ${titleIsTruncated ? "truncated" : ""}`}>
          {displayTitle}
        </div>
        <div
          className={`serp-description ${descriptionIsTruncated ? "truncated" : ""}`}
        >
          {displayDescription}
        </div>

        {(titleIsTruncated || descriptionIsTruncated) && (
          <div className="truncation-warnings">
            {titleIsTruncated && (
              <div className="warning-badge warning-title">
                ⚠ Title truncated ({title.length} chars)
              </div>
            )}
            {descriptionIsTruncated && (
              <div className="warning-badge warning-description">
                ⚠ Description truncated ({description.length} chars)
              </div>
            )}
          </div>
        )}
      </div>

      <div className="char-count-info">
        <div className="count-item">
          <span className="count-label">Title:</span>
          <span className={`count-value ${titleIsTruncated ? "over" : ""}`}>
            {title.length}/{rules.titleMaxChars}
          </span>
        </div>
        <div className="count-item">
          <span className="count-label">Description:</span>
          <span
            className={`count-value ${descriptionIsTruncated ? "over" : ""}`}
          >
            {description.length}/{rules.descriptionMaxChars}
          </span>
        </div>
      </div>
    </div>
  );
};
