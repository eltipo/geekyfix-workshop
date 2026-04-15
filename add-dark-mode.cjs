const fs = require('fs');
const path = require('path');

const dir = './src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f));
files.push('./src/App.tsx');

const replacements = [
  { regex: /bg-white(?!\s+dark:)/g, replace: 'bg-white dark:bg-gray-800' },
  { regex: /bg-gray-50(?!\s+dark:)/g, replace: 'bg-gray-50 dark:bg-gray-900' },
  { regex: /bg-gray-100(?!\s+dark:)/g, replace: 'bg-gray-100 dark:bg-gray-800' },
  { regex: /text-gray-900(?!\s+dark:)/g, replace: 'text-gray-900 dark:text-gray-100' },
  { regex: /text-gray-800(?!\s+dark:)/g, replace: 'text-gray-800 dark:text-gray-200' },
  { regex: /text-gray-700(?!\s+dark:)/g, replace: 'text-gray-700 dark:text-gray-300' },
  { regex: /text-gray-600(?!\s+dark:)/g, replace: 'text-gray-600 dark:text-gray-400' },
  { regex: /text-gray-500(?!\s+dark:)/g, replace: 'text-gray-500 dark:text-gray-400' },
  { regex: /border-gray-100(?!\s+dark:)/g, replace: 'border-gray-100 dark:border-gray-700' },
  { regex: /border-gray-200(?!\s+dark:)/g, replace: 'border-gray-200 dark:border-gray-700' },
  { regex: /border-gray-300(?!\s+dark:)/g, replace: 'border-gray-300 dark:border-gray-600' },
  { regex: /bg-blue-50(?!\s+dark:)/g, replace: 'bg-blue-50 dark:bg-blue-900\/20' },
  { regex: /border-blue-100(?!\s+dark:)/g, replace: 'border-blue-100 dark:border-blue-800' },
  { regex: /text-blue-800(?!\s+dark:)/g, replace: 'text-blue-800 dark:text-blue-300' },
  { regex: /text-blue-600(?!\s+dark:)/g, replace: 'text-blue-600 dark:text-blue-400' },
  { regex: /bg-red-50(?!\s+dark:)/g, replace: 'bg-red-50 dark:bg-red-900\/20' },
  { regex: /text-red-600(?!\s+dark:)/g, replace: 'text-red-600 dark:text-red-400' },
  { regex: /border-red-100(?!\s+dark:)/g, replace: 'border-red-100 dark:border-red-800' },
  { regex: /bg-green-50(?!\s+dark:)/g, replace: 'bg-green-50 dark:bg-green-900\/20' },
  { regex: /text-green-600(?!\s+dark:)/g, replace: 'text-green-600 dark:text-green-400' },
  { regex: /bg-yellow-50(?!\s+dark:)/g, replace: 'bg-yellow-50 dark:bg-yellow-900\/20' },
  { regex: /text-yellow-600(?!\s+dark:)/g, replace: 'text-yellow-600 dark:text-yellow-400' },
  { regex: /bg-purple-100(?!\s+dark:)/g, replace: 'bg-purple-100 dark:bg-purple-900\/30' },
  { regex: /text-purple-700(?!\s+dark:)/g, replace: 'text-purple-700 dark:text-purple-300' },
  { regex: /bg-blue-100(?!\s+dark:)/g, replace: 'bg-blue-100 dark:bg-blue-900\/30' },
  { regex: /text-blue-700(?!\s+dark:)/g, replace: 'text-blue-700 dark:text-blue-300' },
  { regex: /bg-green-100(?!\s+dark:)/g, replace: 'bg-green-100 dark:bg-green-900\/30' },
  { regex: /text-green-700(?!\s+dark:)/g, replace: 'text-green-700 dark:text-green-300' },
  { regex: /bg-yellow-100(?!\s+dark:)/g, replace: 'bg-yellow-100 dark:bg-yellow-900\/30' },
  { regex: /text-yellow-700(?!\s+dark:)/g, replace: 'text-yellow-700 dark:text-yellow-300' },
  { regex: /hover:bg-gray-100(?!\s+dark:)/g, replace: 'hover:bg-gray-100 dark:hover:bg-gray-700' },
  { regex: /hover:bg-gray-50(?!\s+dark:)/g, replace: 'hover:bg-gray-50 dark:hover:bg-gray-800' },
  { regex: /hover:bg-blue-50(?!\s+dark:)/g, replace: 'hover:bg-blue-50 dark:hover:bg-blue-900\/30' },
  { regex: /hover:bg-red-50(?!\s+dark:)/g, replace: 'hover:bg-red-50 dark:hover:bg-red-900\/30' },
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  replacements.forEach(r => {
    content = content.replace(r.regex, r.replace);
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Updated ${file}`);
  }
});
