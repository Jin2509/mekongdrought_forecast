import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/** Bọc Apache ECharts: tạo 1 lần, cập nhật option khi đổi, tự co giãn theo khung. */
export default function EChart({ option, height = 260 }) {
  const el = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    chart.current = echarts.init(el.current, null, { renderer: "canvas" });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chart.current && option) chart.current.setOption(option, true);
  }, [option]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
