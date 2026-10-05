const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Safe-area insets
content = content.replace(
  /padding: 16px clamp\(16px, 2\.5vw, 40px\) 48px;/,
  'padding: calc(16px + env(safe-area-inset-top)) clamp(16px, 2.5vw, 40px) calc(48px + env(safe-area-inset-bottom));'
);

// 2. 44px touch targets
content = content.replace(
  /touch-action: manipulation; \}/,
  'touch-action: manipulation; min-height: 44px; min-width: 44px; }'
);
content = content.replace(
  /input:focus-visible, select:focus-visible/,
  'input, select { min-height: 44px; }\n    input:focus-visible, select:focus-visible'
);
content = content.replace(
  /\.modal-close \{/,
  '.modal-close {\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      min-height: 44px;\n      min-width: 44px;'
);

// 3. Replace raw checkmarks and crosses in DOM with SVGs
const svgCheck = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:text-bottom; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const svgCross = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:text-bottom; margin-right:4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

content = content.replace(/>✕</g, `>${svgCross.replace('margin-right:4px;', '')}<`); 
content = content.replace(/✓ /g, `${svgCheck}`);
content = content.replace(/✕ /g, `${svgCross}`);

// Revert toast calls
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
content = content.replace(/toast\([^)]+\)/g, (match) => {
  return match.replace(new RegExp(escapeRegExp(svgCheck), 'g'), '✓ ')
              .replace(new RegExp(escapeRegExp(svgCross), 'g'), '✕ ');
});

fs.writeFileSync(targetPath, content, 'utf8');
console.log('UI/UX design fixes applied to index.html');
