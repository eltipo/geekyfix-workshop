const fs = require('fs');
const path = require('path');

const dir = './src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f));
files.push('./src/App.tsx');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  // Fix hover states that were incorrectly replaced
  content = content.replace(/hover:bg-gray-100 dark:bg-gray-800/g, 'hover:bg-gray-100 dark:hover:bg-gray-800');
  content = content.replace(/hover:bg-gray-50 dark:bg-gray-900/g, 'hover:bg-gray-50 dark:hover:bg-gray-900');
  content = content.replace(/hover:bg-blue-50 dark:bg-blue-900\/20/g, 'hover:bg-blue-50 dark:hover:bg-blue-900/20');
  content = content.replace(/hover:bg-red-50 dark:bg-red-900\/20/g, 'hover:bg-red-50 dark:hover:bg-red-900/20');
  content = content.replace(/hover:bg-green-50 dark:bg-green-900\/20/g, 'hover:bg-green-50 dark:hover:bg-green-900/20');
  
  // Fix divide-y divide-gray-100
  content = content.replace(/divide-gray-100(?!\s+dark:)/g, 'divide-gray-100 dark:divide-gray-700');
  content = content.replace(/divide-gray-200(?!\s+dark:)/g, 'divide-gray-200 dark:divide-gray-700');

  // Fix text-gray-400
  content = content.replace(/text-gray-400(?!\s+dark:)/g, 'text-gray-400 dark:text-gray-500');

  // Fix bg-gray-200
  content = content.replace(/bg-gray-200(?!\s+dark:)/g, 'bg-gray-200 dark:bg-gray-700');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Fixed ${file}`);
  }
});
