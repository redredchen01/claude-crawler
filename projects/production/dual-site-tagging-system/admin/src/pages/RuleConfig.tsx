import React from "react";

const RuleConfig: React.FC = () => {
  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Rules</h1>
      <p style={{ fontSize: "1.1rem", color: "#666", marginTop: "1rem" }}>
        Coming in Phase 9: Rule engine configuration and management
      </p>
      <p style={{ marginTop: "1rem", color: "#999" }}>This page will enable:</p>
      <ul style={{ marginLeft: "1.5rem", marginTop: "0.5rem", color: "#999" }}>
        <li>Create and edit tagging rules based on resource features</li>
        <li>Set rule priorities and conflict resolution</li>
        <li>Test rules against sample resources</li>
        <li>Enable/disable rules for A/B testing</li>
      </ul>
    </div>
  );
};

export default RuleConfig;
