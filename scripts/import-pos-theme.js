#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const posThemePath = path.resolve(__dirname, '../../POS_V2/src/app/core/theme/theme.constants.ts');
const targetThemePath = path.resolve(__dirname, '../src/theme/theme.ts');

function findExportBlock(content, exportName) {
  const idx = content.indexOf(`export const ${exportName}`);
  if (idx === -1) return null;
  const braceStart = content.indexOf('{', idx);
  if (braceStart === -1) return null;
  let i = braceStart;
  let level = 0;
  for (; i < content.length; i++) {
    if (content[i] === '{') level++;
    else if (content[i] === '}') {
      level--;
      if (level === 0) {
        // return substring from start to closing brace
        return content.slice(idx, i + 1);
      }
    }
  }
  return null;
}

function findDefaultTheme(content) {
  // Handle optional type annotation: export const DEFAULT_THEME: ThemeName = 'dark';
  const m = content.match(/export\s+const\s+DEFAULT_THEME(?:\s*:\s*\w+)?\s*=\s*['\"](.*?)['\"]/);
  return m ? m[1] : null;
}

if (!fs.existsSync(posThemePath)) {
  console.error('POS_V2 theme file not found at ' + posThemePath);
  process.exit(1);
}

const posContent = fs.readFileSync(posThemePath, 'utf8');
const themesBlock = findExportBlock(posContent, 'THEMES');
const defaultTheme = findDefaultTheme(posContent);

if (!themesBlock) {
  console.error('Could not extract THEMES block from POS_V2 theme file');
  process.exit(1);
}

if (!defaultTheme) {
  console.error('Could not extract DEFAULT_THEME from POS_V2 theme file');
  process.exit(1);
}

// Read target file
if (!fs.existsSync(targetThemePath)) {
  console.error('Target theme file not found at ' + targetThemePath);
  process.exit(1);
}

let targetContent = fs.readFileSync(targetThemePath, 'utf8');

// Replace THEMES block in target
const existingThemesIdx = targetContent.indexOf('export const THEMES');
if (existingThemesIdx === -1) {
  console.error('Target file does not contain export const THEMES');
  process.exit(1);
}

const newThemesBlock = `export const THEMES: { light: ThemeColors; dark: ThemeColors } = ${themesBlock.slice(themesBlock.indexOf('{'))};`;

// find end of existing THEMES block
const findBlockEnd = (content, startIdx) => {
  const braceStart = content.indexOf('{', startIdx);
  let i = braceStart;
  let level = 0;
  for (; i < content.length; i++) {
    if (content[i] === '{') level++;
    else if (content[i] === '}') {
      level--;
      if (level === 0) {
        // look for semicolon after
        const rest = content.slice(i, i + 5);
        const semi = content.indexOf(';', i);
        return semi !== -1 ? semi + 1 : i + 1;
      }
    }
  }
  return -1;
};

const themesEnd = findBlockEnd(targetContent, existingThemesIdx);
if (themesEnd === -1) {
  console.error('Could not find end of existing THEMES block in target file');
  process.exit(1);
}

// Replace
targetContent = targetContent.slice(0, existingThemesIdx) + newThemesBlock + targetContent.slice(themesEnd);

// Replace DEFAULT_THEME line
const defaultLineRegex = /export\s+const\s+DEFAULT_THEME\s*=\s*['"].*?['"];?/;
if (defaultLineRegex.test(targetContent)) {
  targetContent = targetContent.replace(defaultLineRegex, `export const DEFAULT_THEME = '${defaultTheme}';`);
} else {
  // append
  targetContent = targetContent + `\nexport const DEFAULT_THEME = '${defaultTheme}';\n`;
}

fs.writeFileSync(targetThemePath, targetContent, 'utf8');
console.log('Theme synchronized from POS_V2 to WaiterApp (DEFAULT_THEME:', defaultTheme, ')');
process.exit(0);
