#!/usr/bin/env node

import { ESLint } from 'eslint';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, stat } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Test categories and their expected behaviors
const testCategories = {
  'valid': {
    description: 'Files that should have minimal or no errors',
    files: ['test/valid.tsx', 'test/preact-test.tsx', 'test/typescript-rules.ts', 'test/type-assertions.ts', 'test/valid-interface-unions.tsx'],
    maxErrors: 0,
    maxWarnings: 10,
  },
  'invalid': {
    description: 'Files that should trigger specific errors',
    files: ['test/invalid.tsx', 'test/jsx-extension-test.js', 'test/type-assertions-invalid.ts', 'test/invalid-interface-unions.tsx'],
    maxErrors: 20,
    maxWarnings: 40,
    expectedRules: ['no-restricted-syntax', 'react/jsx-filename-extension'],
  },
  'warnings': {
    description: 'Files that should trigger warnings',
    files: ['test/long-function-test.tsx'],
    maxErrors: 2,
    maxWarnings: 5,
    expectedRules: ['max-lines-per-function'],
  },
  'hooks': {
    description: 'React hooks rules testing',
    files: ['test/react-hooks-rules.tsx'],
    maxErrors: 10,
    maxWarnings: 20,
    expectedRules: ['react-hooks/exhaustive-deps', 'react-hooks/rules-of-hooks'],
  },
  'imports': {
    description: 'Import/export patterns testing',
    files: ['test/import-export-rules.ts'],
    maxErrors: 2,
    maxWarnings: 10,
  },
  'edge-cases': {
    description: 'Edge cases and boundary testing',
    files: ['test/edge-cases.tsx'],
    maxErrors: 5,
    maxWarnings: 30,
  },
  'performance': {
    description: 'Performance and large file testing',
    files: ['test/performance-test.tsx'],
    maxErrors: 10,
    maxWarnings: 35,
  },
  'export-valid': {
    description: 'Valid export patterns',
    files: [
      'test/export/valid/single-named-export.ts',
      'test/export/valid/single-function-export.ts',
      'test/export/valid/single-class-export.ts',
      'test/export/valid/single-interface-export.ts',
      'test/export/valid/single-type-export.ts',
      'test/export/valid/single-re-export.ts',
      'test/export/valid/single-type-re-export.ts',
      'test/export/valid/single-as-const-export.ts',
      'test/export/valid/multiple-re-exports.ts',
      'test/export/valid/jsx-component-with-props.jsx',
      'test/export/valid/tsx-component-with-props.tsx',
      'test/export/valid/tsx-component-with-type.tsx',
      'test/export/valid/tsx-class-component-with-props.tsx',
      'test/export/valid/tsx-multiple-individual-exports.tsx',
      'test/export/valid/tsx-export-statement.tsx',
      'test/export/valid/jsx-export-statement.jsx'
    ],
    maxErrors: 0,
    maxWarnings: 5,
  },
  'export-invalid': {
    description: 'Invalid export patterns',
    files: [
      'test/export/invalid/default-export.ts',
      'test/export/invalid/default-class-export.ts',
      'test/export/invalid/multiple-named-exports.ts',
      'test/export/invalid/export-star.ts',
      'test/export/invalid/export-star-as.ts',
      'test/export/invalid/mixed-exports.ts',
      'test/export/invalid/default-with-named.ts'
    ],
    maxErrors: 10,
    maxWarnings: 5,
    expectedRules: ['import/no-default-export', 'no-restricted-syntax'],
  },
};

async function findTestFiles() {
  const files = [];

  // Recursively check test/ directory
  async function scanDirectory(dirPath, relativePath) {
    try {
      const entries = await readdir(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stats = await stat(fullPath);
        const relativeFilePath = join(relativePath, entry);

        if (stats.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
          files.push(relativeFilePath);
        } else if (stats.isDirectory()) {
          await scanDirectory(fullPath, relativeFilePath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory ${relativePath}:`, error.message);
    }
  }

  await scanDirectory(join(projectRoot, 'test'), 'test');

  // Check for specific test files in root directory
  const rootTestFiles = [];
  for (const testFile of rootTestFiles) {
    const fullPath = join(projectRoot, testFile);
    try {
      const stats = await stat(fullPath);
      if (stats.isFile()) {
        files.push(testFile);
      }
    } catch (error) {
      // File doesn't exist, skip
    }
  }

  return files.sort();
}

async function runTestCategory(eslint, category, config) {
  console.log(`\n📁 Testing category: ${category}`);
  console.log(`   ${config.description}`);

  let categoryPassed = true;
  const categoryResults = {
    totalErrors: 0,
    totalWarnings: 0,
    rulesCovered: new Set(),
    fileResults: [],
  };

  for (const file of config.files) {
    const filePath = join(projectRoot, file);

    try {
      const results = await eslint.lintFiles([filePath]);
      const result = results[0];

      if (result) {
        const errorCount = result.errorCount;
        const warningCount = result.warningCount;

        categoryResults.totalErrors += errorCount;
        categoryResults.totalWarnings += warningCount;
        categoryResults.fileResults.push({
          file,
          errors: errorCount,
          warnings: warningCount,
          messages: result.messages,
        });

        // Collect rules that were triggered
        result.messages.forEach(msg => {
          if (msg.ruleId) {
            categoryResults.rulesCovered.add(msg.ruleId);
          }
        });

        console.log(`   📄 ${file}: ${errorCount} errors, ${warningCount} warnings`);

        // Show top errors/warnings for debugging
        if (result.messages.length > 0) {
          const topMessages = result.messages.slice(0, 3);
          topMessages.forEach(msg => {
            const level = msg.severity === 2 ? '❌' : '⚠️ ';
            console.log(`      ${level} Line ${msg.line}: ${msg.message} (${msg.ruleId || 'unknown'})`);
          });

          if (result.messages.length > 3) {
            console.log(`      ... and ${result.messages.length - 3} more issues`);
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error linting ${file}:`, error.message);
      categoryPassed = false;
    }
  }

  // Validate category expectations
  if (categoryResults.totalErrors > config.maxErrors) {
    console.log(`   ❌ Too many errors: ${categoryResults.totalErrors} > ${config.maxErrors}`);
    categoryPassed = false;
  }

  if (categoryResults.totalWarnings > config.maxWarnings) {
    console.log(`   ❌ Too many warnings: ${categoryResults.totalWarnings} > ${config.maxWarnings}`);
    categoryPassed = false;
  }

  // Check for expected rules
  if (config.expectedRules) {
    const missingRules = config.expectedRules.filter(rule =>
      !categoryResults.rulesCovered.has(rule)
    );

    if (missingRules.length > 0) {
      console.log(`   ⚠️  Expected rules not found: ${missingRules.join(', ')}`);
    }

    if (categoryResults.rulesCovered.size > 0) {
      console.log(`   ✅ Rules covered: ${Array.from(categoryResults.rulesCovered).join(', ')}`);
    }
  }

  const status = categoryPassed ? '✅' : '❌';
  console.log(`   ${status} Category result: ${categoryResults.totalErrors} errors, ${categoryResults.totalWarnings} warnings`);

  return { passed: categoryPassed, results: categoryResults };
}

async function generateTestReport(allResults) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST REPORT SUMMARY');
  console.log('='.repeat(80));

  let overallPassed = true;
  let totalErrors = 0;
  let totalWarnings = 0;
  const allRulesCovered = new Set();

  for (const [category, { passed, results }] of Object.entries(allResults)) {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${category}: ${results.totalErrors} errors, ${results.totalWarnings} warnings`);

    if (!passed) overallPassed = false;
    totalErrors += results.totalErrors;
    totalWarnings += results.totalWarnings;

    results.rulesCovered.forEach(rule => allRulesCovered.add(rule));
  }

  console.log('\n📋 Overall Statistics:');
  console.log(`   Total Errors: ${totalErrors}`);
  console.log(`   Total Warnings: ${totalWarnings}`);
  console.log(`   Rules Covered: ${allRulesCovered.size}`);
  console.log(`   Categories Tested: ${Object.keys(allResults).length}`);

  console.log('\n🔧 Rules Coverage:');
  const sortedRules = Array.from(allRulesCovered).sort();
  for (let i = 0; i < sortedRules.length; i += 3) {
    const chunk = sortedRules.slice(i, i + 3);
    console.log(`   ${chunk.join(', ')}`);
  }

  console.log('\n' + '='.repeat(80));

  if (overallPassed) {
    console.log('🎉 ALL TESTS PASSED!');
    return true;
  } else {
    console.log('💥 SOME TESTS FAILED!');
    return false;
  }
}

async function runComprehensiveTests() {
  console.log('🚀 Starting Comprehensive ESLint Configuration Tests');
  console.log('='.repeat(60));

  try {
    // Initialize ESLint
    const eslint = new ESLint({
      overrideConfigFile: join(projectRoot, 'eslint.config.js'),
    });

    // Discover all test files
    const allTestFiles = await findTestFiles();
    console.log(`📁 Discovered ${allTestFiles.length} test files:`);
    allTestFiles.forEach(file => console.log(`   - ${file}`));

    // Run tests by category
    const allResults = {};

    for (const [category, config] of Object.entries(testCategories)) {
      // Filter files that exist
      const existingFiles = config.files.filter(file =>
        allTestFiles.includes(file)
      );

      if (existingFiles.length === 0) {
        console.log(`\n⚠️  Skipping category '${category}' - no files found`);
        continue;
      }

      const categoryConfig = { ...config, files: existingFiles };
      const result = await runTestCategory(eslint, category, categoryConfig);
      allResults[category] = result;
    }

    // Generate final report
    const overallPassed = await generateTestReport(allResults);

    if (overallPassed) {
      process.exit(0);
    } else {
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
ESLint Configuration Test Runner

Usage:
  node scripts/test-runner.js [options]

Options:
  -h, --help     Show this help message
  --verbose      Show detailed output
  --category     Run specific category only

Examples:
  node scripts/test-runner.js
  node scripts/test-runner.js --verbose
  node scripts/test-runner.js --category=hooks
  `);
  process.exit(0);
}

runComprehensiveTests();