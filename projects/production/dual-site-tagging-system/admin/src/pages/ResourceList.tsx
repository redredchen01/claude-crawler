import React from "react";

const ResourceList: React.FC = () => {
  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Resources</h1>
      <p style={{ fontSize: "1.1rem", color: "#666", marginTop: "1rem" }}>
        Coming in Phase 9: Resource management interface
      </p>
      <p style={{ marginTop: "1rem", color: "#999" }}>
        This page will allow you to:
      </p>
      <ul style={{ marginLeft: "1.5rem", marginTop: "0.5rem", color: "#999" }}>
        <li>Upload and ingest new resources (images and videos)</li>
        <li>View extracted features and auto-generated tags</li>
        <li>Manage resource metadata and relationships</li>
      </ul>
    </div>
  );
};

export default ResourceList;
