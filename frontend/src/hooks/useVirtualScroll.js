import { useState, useEffect, useCallback, useMemo } from "react";

export function useVirtualScroll({ itemCount, itemHeight = 48, containerRef, overscan = 5 }) {
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    if (containerRef && containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    } else {
      setScrollTop(window.scrollY);
    }
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef && containerRef.current ? containerRef.current : window;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef, handleScroll]);

  const totalHeight = itemCount * itemHeight;

  const { startIndex, endIndex } = useMemo(() => {
    const containerHeight = containerRef && containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(itemCount - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
    return { startIndex: start, endIndex: end };
  }, [scrollTop, itemCount, itemHeight, containerRef, overscan]);

  const virtualItems = useMemo(() => {
    const items = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= 0 && i < itemCount) {
        items.push({
          index: i,
          offsetTop: i * itemHeight,
        });
      }
    }
    return items;
  }, [startIndex, endIndex, itemCount, itemHeight]);

  const offsetY = startIndex * itemHeight;

  return {
    virtualItems,
    totalHeight,
    offsetY,
    startIndex,
    endIndex,
  };
}
