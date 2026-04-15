import React from "react";

const SiteTagConfig: React.FC = () => {
  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Site Config</h1>
      <p style={{ fontSize: "1.1rem", color: "#666", marginTop: "1rem" }}>
        Coming in Phase 9: Per-site tag display and configuration
      </p>
      <p style={{ marginTop: "1rem", color: "#999" }}>This page will allow:</p>
      <ul style={{ marginLeft: "1.5rem", marginTop: "0.5rem", color: "#999" }}>
        <li>Configure per-site tag display names and slugs</li>
        <li>Control tag visibility on each site</li>
        <li>Set site-specific tag defaults and ordering</li>
        <li>Manage tag aliases for site-specific naming</li>
      </ul>
    </div>
  );
};

export default SiteTagConfig;
