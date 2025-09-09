import React from 'react';

const HistoryChart = ({ history, width = 150, height = 40 }: { history: number[], width?: number, height?: number }) => {
  if (!history || history.length < 2) {
    return <div style={{ width, height, border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', background: '#1e1e1e', borderRadius: 4 }}>No data</div>;
  }

  const maxVal = Math.max(...history);
  const minVal = Math.min(...history);
  const range = maxVal - minVal;

  const points = history
    .map((val, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((val - minVal) / (range || 1)) * height;
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: '#1e1e1e', borderRadius: 4 }}>
      <polyline
        fill="none"
        stroke="#00aaff"
        strokeWidth="1"
        points={points}
      />
    </svg>
  );
};

export default HistoryChart;
