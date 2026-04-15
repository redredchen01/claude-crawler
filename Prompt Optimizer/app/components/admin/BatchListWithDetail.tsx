"use client";

import { useState } from "react";
import BatchList, { BatchListItem } from "./BatchList";
import BatchDetail from "./BatchDetail";

export default function BatchListWithDetail() {
  const [selectedBatch, setSelectedBatch] = useState<BatchListItem | null>(
    null,
  );

  return (
    <>
      <BatchList onSelectBatch={setSelectedBatch} />
      {selectedBatch && (
        <BatchDetail
          jobId={selectedBatch.id}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </>
  );
}
