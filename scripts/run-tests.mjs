import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const testFiles = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => path.join('tests', f));

const startTime = Date.now();
const child = spawn('node', ['--test', ...testFiles], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  const str = data.toString();
  stdout += str;
  process.stdout.write(str);
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  stderr += str;
  process.stderr.write(str);
});

child.on('close', (code) => {
  const duration = Date.now() - startTime;
  const now = new Date();
  const timestampIST = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(now);

  // Extract pass / fail stats
  const totalMatch = stdout.match(/ℹ tests (\d+)/);
  const passMatch = stdout.match(/ℹ pass (\d+)/);
  const failMatch = stdout.match(/ℹ fail (\d+)/);

  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const passed = passMatch ? Number(passMatch[1]) : 0;
  const failed = failMatch ? Number(failMatch[1]) : 0;
  const statusBadge = failed === 0 ? '✅ PASSED (All tests passed)' : `❌ FAILED (${failed} failing tests)`;

  // Update TEST_REPORT.md with the live run header and details
  const reportPath = 'TEST_REPORT.md';
  let reportContent = '';
  if (fs.existsSync(reportPath)) {
    reportContent = fs.readFileSync(reportPath, 'utf8');
  }

  const latestRunBanner = `<!-- AUTO-GENERATED TEST RUN HEADER -->
> **Last Automated Run:** ${timestampIST} (IST)  
> **Status:** ${statusBadge}  
> **Total Tests:** ${total} | **Passed:** ${passed} | **Failed:** ${failed}  
> **Execution Duration:** ${duration}ms  
<!-- /AUTO-GENERATED TEST RUN HEADER -->`;

  const bannerRegex = /<!-- AUTO-GENERATED TEST RUN HEADER -->[\s\S]*?<!-- \/AUTO-GENERATED TEST RUN HEADER -->/;
  if (bannerRegex.test(reportContent)) {
    reportContent = reportContent.replace(bannerRegex, latestRunBanner);
  } else {
    reportContent = reportContent.replace(
      /# ERP System Test Execution & Verification Report/,
      `# ERP System Test Execution & Verification Report\n\n${latestRunBanner}`
    );
  }

  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(`\n📄 Report updated: ${path.resolve(reportPath)}`);
  process.exit(code ?? 0);
});
