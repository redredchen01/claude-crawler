"use client";

import { useEffect, useRef, useState, useCallback, ReactNode } from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  renderItem: (item: T, index: number) => ReactNode;
  height: number;
  width?: number | string;
  overscan?: number;
  onLoadMore?: (startIndex: number) => void;
  hasMore?: boolean;
  isLoading?: boolean;
  className?: string;
}

interface ItemOffset {
  offset: number;
  size: number;
}

export default function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  height,
  width = "100%",
  overscan = 5,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  className = "",
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  // Calculate item offsets for dynamic heights
  const itemOffsets = useRef<ItemOffset[]>([]);

  const getItemOffset = useCallback(
    (index: number): ItemOffset => {
      const isFixedHeight = typeof itemHeight === "number";

      if (isFixedHeight) {
        const size = itemHeight as number;
        return {
          offset: index * size,
          size,
        };
      }

      // For dynamic heights, calculate cumulatively
      if (!itemOffsets.current[index]) {
        const size = (itemHeight as (i: number) => number)(index);
        const prevOffset = index > 0 ? itemOffsets.current[index - 1] : null;
        const offset = (prevOffset?.offset || 0) + (prevOffset?.size || 0);

        itemOffsets.current[index] = { offset, size };
      }

      return itemOffsets.current[index];
    },
    [itemHeight]
  );

  const getTotalHeight = useCallback(() => {
    if (items.length === 0) return 0;

    const lastIndex = items.length - 1;
    const lastItem = getItemOffset(lastIndex);
    return lastItem.offset + lastItem.size;
  }, [items.length, getItemOffset]);

  const getVisibleRange = useCallback(() => {
    if (items.length === 0) return { start: 0, end: 0 };

    let start = 0;
    let end = items.length - 1;

    // Binary search for visible range
    for (let i = 0; i < items.length; i++) {
      const offset = getItemOffset(i).offset;
      if (offset + getItemOffset(i).size > scrollTop) {
        start = Math.max(0, i - overscan);
        break;
      }
    }

    for (let i = start; i < items.length; i++) {
      const offset = getItemOffset(i).offset;
      if (offset > scrollTop + height) {
        end = Math.min(items.length - 1, i + overscan);
        break;
      }
    }

    return { start, end };
  }, [items.length, scrollTop, height, overscan, getItemOffset]);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);

      // Load more trigger
      if (hasMore && onLoadMore) {
        const scrollBottom =
          target.scrollHeight - target.scrollTop - target.clientHeight;

        if (scrollBottom < 500) {
          onLoadMore(items.length);
        }
      }
    },
    [hasMore, onLoadMore, items.length]
  );

  // Update visible range
  useEffect(() => {
    setVisibleRange(getVisibleRange());
  }, [scrollTop, items.length, getVisibleRange]);

  const totalHeight = getTotalHeight();
  const visibleItems = items.slice(visibleRange.start, visibleRange.end + 1);

  return (
    <div
      ref={scrollRef}
      className={`overflow-auto ${className}`}
      style={{ height, width }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, visibleIndex) => {
          const actualIndex = visibleRange.start + visibleIndex;
          const offset = getItemOffset(actualIndex).offset;

          return (
            <div
              key={actualIndex}
              style={{
                position: "absolute",
                top: offset,
                left: 0,
                right: 0,
              }}
            >
              {renderItem(item, actualIndex)}
            </div>
          );
        })}

        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: totalHeight,
              left: 0,
              right: 0,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="text-gray-500">Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
}
