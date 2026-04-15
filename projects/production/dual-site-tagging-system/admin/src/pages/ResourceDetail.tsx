import React from "react";

const ResourceDetail: React.FC = () => {
  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Resource Detail</h1>
      <p style={{ fontSize: "1.1rem", color: "#666", marginTop: "1rem" }}>
        Coming in Phase 9: Individual resource details and feature inspection
      </p>
      <p style={{ marginTop: "1rem", color: "#999" }}>This page will show:</p>
      <ul style={{ marginLeft: "1.5rem", marginTop: "0.5rem", color: "#999" }}>
        <li>Resource metadata (dimensions, duration, format)</li>
        <li>Extracted features (OCR text, keyframes, visual properties)</li>
        <li>Auto-generated and manual tags</li>
        <li>Audit trail of tag changes</li>
      </ul>
    </div>
  );
};

export default ResourceDetail;
