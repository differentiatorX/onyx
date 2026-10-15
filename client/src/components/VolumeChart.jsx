// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { money, shortDate } from '../format.js';

/** Plain SVG bar chart of daily captured volume. No chart library needed. */
export default function VolumeChart({ series }) {
  const W = 700;
  const H = 180;
  const pad = { top: 10, bottom: 24, left: 4, right: 4 };
  const max = Math.max(...series.map((d) => d.volume), 1);
  const slot = (W - pad.left - pad.right) / series.length;
  const barW = Math.max(slot * 0.62, 2);
  const innerH = H - pad.top - pad.bottom;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Captured volume per day">
        <line className="base" x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} />
        {series.map((d, i) => {
          const h = (d.volume / max) * innerH;
          const x = pad.left + i * slot + (slot - barW) / 2;
          return (
            <g key={d.date}>
              <rect className={i === series.length - 1 ? 'bar today' : 'bar'} x={x} y={H - pad.bottom - h} width={barW} height={Math.max(h, d.volume ? 1 : 0)} rx="2">
                <title>{`${shortDate(d.date)}: ${money(d.volume)} across ${d.count} payments`}</title>
              </rect>
              {i % 2 === 0 && (
                <text className="axis" x={x + barW / 2} y={H - 6} textAnchor="middle">
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
