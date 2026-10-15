// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useId } from 'react';

/** The Onyx mark: a polished cross-section of banded onyx with one sardonyx band. */
export function OnyxMark({ size = 28, title }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <radialGradient id={`${id}s`} cx="35%" cy="28%" r="85%">
          <stop offset="0" stopColor="#303236" />
          <stop offset="0.5" stopColor="#141518" />
          <stop offset="1" stopColor="#060607" />
        </radialGradient>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E2B07A" />
          <stop offset="1" stopColor="#A86E35" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0.1" y1="0" x2="0.7" y2="0.8">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}s)`} />
      <g clipPath={`url(#${id}c)`}>
        <g transform="rotate(-32 26 42)">
          <ellipse cx="26" cy="42" rx="40" ry="27" fill="none" stroke="#EDE9E2" strokeOpacity="0.18" strokeWidth="1.2" />
          <ellipse cx="26" cy="42" rx="31" ry="21" fill="none" stroke="#EDE9E2" strokeOpacity="0.32" strokeWidth="1.6" />
          <ellipse cx="26" cy="42" rx="22.5" ry="15" fill="none" stroke={`url(#${id}a)`} strokeWidth="3.6" />
          <ellipse cx="26" cy="42" rx="14" ry="9.2" fill="none" stroke="#EDE9E2" strokeOpacity="0.75" strokeWidth="2" />
          <ellipse cx="26" cy="42" rx="6.5" ry="4.2" fill="#EDE9E2" fillOpacity="0.9" />
        </g>
      </g>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}h)`} />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.1" strokeWidth="1" />
    </svg>
  );
}

export function Wordmark({ size = 28, className = '' }) {
  return (
    <span className={`wordmark ${className}`} style={{ '--mark': `${size}px` }}>
      <OnyxMark size={size} />
      <span>Onyx</span>
    </span>
  );
}
