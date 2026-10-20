import React, { useId } from 'react';

export const CakePieceIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id={`${id}-crumb`} x1="18" y1="30" x2="42" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE7AA" />
          <stop offset="0.55" stopColor="#F4C773" />
          <stop offset="1" stopColor="#D99339" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="28" y1="13" x2="36" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#96532C" />
          <stop offset="0.5" stopColor="#6F351F" />
          <stop offset="1" stopColor="#49251C" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="27" ry="4" fill="#672C20" opacity="0.13" />
      <path d="M38 12C48 12 57 18 58 27V47L38 50V12Z" fill="#B67132" stroke="#8C4F27" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7 32L58 27V47L7 55V32Z" fill={`url(#${id}-crumb)`} stroke="#BA7B39" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 50L57 42V47L8 55V50Z" fill="#CC8F43" opacity="0.65" />
      <path d="M8 36L56 30" stroke="#FFF0BD" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <g fill="#BA7A37" opacity="0.65">
        <ellipse cx="16" cy="42" rx="1.8" ry="1.2" />
        <ellipse cx="27" cy="39" rx="1.3" ry="1.6" />
        <ellipse cx="38" cy="43" rx="2" ry="1.4" />
        <ellipse cx="49" cy="36" rx="1.7" ry="1.2" />
        <circle cx="22" cy="48" r="1.1" />
        <circle cx="47" cy="44" r="1" />
      </g>
      <path d="M7 32L38 12C47 12 55 17 58 27L7 35V32Z" fill={`url(#${id}-top)`} stroke="#62331F" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 33L57 26V31L49 32C47 32 48 36 45 36C42 36 43 33 40 34L9 38L8 33Z" fill="#68331F" />
      <path d="M17 28L39 15C44 15 48 17 51 20" stroke="#C18A55" strokeWidth="1.7" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
};
