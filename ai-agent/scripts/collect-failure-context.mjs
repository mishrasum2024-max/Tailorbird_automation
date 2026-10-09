import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

const TEST_RESULTS_DIR = path.join(ROOT_DIR, 'test-results');
const RESULTS_JSON = path.join(TEST_RESULTS_DIR, 'test-results.json');

const INVESTIGATIONS_DIR = path.join(
  ROOT_DIR,
  'ai-agent',
  'investigations'
);

function runGitCommand(command) {
  try {
    return execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'Unavailable';
  }
}

function relativePath(filePath) {
  return path.relative(ROOT_DIR, filePath).replaceAll('\\', '/');
}

function getGitInformation() {
  return {
    branch: runGitCommand('git branch --show-current'),

    commit: runGitCommand('git rev-parse HEAD'),

    status: runGitCommand('git status --short'),

    recentCommits: runGitCommand(
      'git log -5 --pretty=format:"%h | %an | %ad | %s" --date=iso'
    ),

    recentDiff: runGitCommand(
      'git diff HEAD~1 HEAD --stat'
    ),
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(
      fs.readFileSync(filePath, 'utf8')
    );
  } catch (error) {
    console.error(
      `Unable to read JSON: ${filePath}`
    );

    return null;
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function walkSuites(suites, results = []) {
  if (!Array.isArray(suites)) {
    return results;
  }

  for (const suite of suites) {
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        results.push({
          suite,
          spec,
        });
      }
    }

    if (Array.isArray(suite.suites)) {
      walkSuites(suite.suites, results);
    }
  }

  return results;
}

function normalizePath(filePath) {
  if (!filePath) {
    return null;
  }

  return filePath.replaceAll('\\', '/');
}

function getArtifactPath(attachments, name) {
  if (!Array.isArray(attachments)) {
    return null;
  }

  const attachment = attachments.find(
    (item) => item.name === name
  );

  return attachment?.path
    ? normalizePath(attachment.path)
    : null;
}

function toAbsolutePath(filePath) {
  if (!filePath) {
    return null;
  }

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(ROOT_DIR, filePath);
}

function getTestSource(filePath) {
  const absolutePath = toAbsolutePath(
    normalizePath(filePath)
  );

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  return readFile(absolutePath);
}

function getResultAttempts(test) {
  if (!Array.isArray(test.results)) {
    return [];
  }

  return test.results.map((result) => {
    const attachments = result.attachments || [];

    const screenshot = getArtifactPath(
      attachments,
      'screenshot'
    );

    const trace = getArtifactPath(
      attachments,
      'trace'
    );

    const errorContext = getArtifactPath(
      attachments,
      'error-context'
    );

    return {
      retry: result.retry ?? 0,

      status: result.status,

      duration: result.duration,

      startTime: result.startTime,

      error: result.error
        ? {
            message: result.error.message || null,
            stack: result.error.stack || null,
          }
        : null,

      errorLocation: result.errorLocation
        ? {
            file: normalizePath(
              result.errorLocation.file
            ),
            line: result.errorLocation.line,
            column: result.errorLocation.column,
          }
        : null,

      steps: result.steps || [],

      stdout: result.stdout || [],

      stderr: result.stderr || [],

      artifacts: {
        screenshot,
        trace,
        errorContext,
      },
    };
  });
}

function createInvestigation(spec, test, suite) {
  const attempts = getResultAttempts(test);

  const failedAttempts = attempts.filter(
    (attempt) => attempt.status === 'failed'
  );

  const firstFailedAttempt =
    failedAttempts[0] || attempts[0] || null;

  const file = normalizePath(
    spec.file || suite.file
  );

  const sourceFile = file
    ? path.join(
        ROOT_DIR,
        'tests',
        file
      )
    : null;

  return {
    generatedAt: new Date().toISOString(),

    test: {
      title: spec.title,

      file,

      line: spec.line,

      column: spec.column,

      project: test.projectName,

      projectId: test.projectId,

      expectedStatus: test.expectedStatus,

      actualStatus: test.status,

      tags: spec.tags || [],
    },

    failure: firstFailedAttempt
      ? {
          message:
            firstFailedAttempt.error?.message || null,

          stack:
            firstFailedAttempt.error?.stack || null,

          errorLocation:
            firstFailedAttempt.errorLocation || null,

          attempts,
        }
      : null,

    source: {
      path: file,

      content: sourceFile
        ? readFile(sourceFile)
        : null,
    },

    git: getGitInformation(),
  };
}

function createMarkdown(investigation) {
  const test = investigation.test;
  const failure = investigation.failure;

  const attempts =
    failure?.attempts || [];

  let attemptsMarkdown = '';

  for (const attempt of attempts) {
    attemptsMarkdown += `
### Attempt ${attempt.retry}

Status: ${attempt.status}

Duration: ${attempt.duration} ms

Start Time: ${attempt.startTime || 'Unknown'}

#### Error

\`\`\`text
${attempt.error?.message || 'No error'}
\`\`\`

#### Error Location

File: ${attempt.errorLocation?.file || 'Unknown'}

Line: ${attempt.errorLocation?.line || 'Unknown'}

Column: ${attempt.errorLocation?.column || 'Unknown'}

#### Artifacts

Screenshot:
${attempt.artifacts.screenshot || 'None'}

Trace:
${attempt.artifacts.trace || 'None'}

Error Context:
${attempt.artifacts.errorContext || 'None'}

`;
  }

  return `# AI Failure Investigation Context

## Test

### Test Case

${test.title}

### Test File

${test.file}

### Test Definition

Line: ${test.line}

Column: ${test.column}

### Project

${test.project}

### Tags

${test.tags.join(', ') || 'None'}

### Expected Status

${test.expectedStatus}

### Actual Status

${test.actualStatus}


---

# Failure

${attemptsMarkdown}


---

# Git Information

## Branch

${investigation.git.branch}

## Commit

${investigation.git.commit}

## Repository Status

\`\`\`
${investigation.git.status || 'Clean'}
\`\`\`

## Recent Commits

\`\`\`
${investigation.git.recentCommits}
\`\`\`

## Most Recent Commit Changes

\`\`\`
${investigation.git.recentDiff}
\`\`\`


---

# Test Source

File:

${investigation.source.path}

\`\`\`javascript
${investigation.source.content || 'Unable to read test source'}
\`\`\`


---

# Investigation Rules

This document contains evidence collected from the failed Playwright execution.

Claude must NOT immediately modify the test.

Claude must:

1. Analyze the failure evidence.
2. Identify possible root causes.
3. Classify the failure.
4. Check the relevant test source.
5. Check recent Git changes.
6. Use Playwright MCP to reproduce and investigate the failure in the real application.
7. Verify the suspected root cause through the browser.
8. Only after MCP verification may a self-healing fix be proposed.
9. A fix must be validated by rerunning the affected test.
10. A regression run must be performed before creating the final PR.

Possible classifications:

- PRODUCT_BUG
- AUTOMATION_BUG
- TIMING_OR_SYNCHRONIZATION
- FLAKY_TEST
- ENVIRONMENT_FAILURE
- UNKNOWN

No classification has been performed yet.
`;
}

function main() {
  console.log('\nAI Failure Context Collector');
  console.log('============================\n');

  if (!fs.existsSync(RESULTS_JSON)) {
    console.error(
      'test-results.json was not found.'
    );

    console.error(
      `Expected: ${RESULTS_JSON}`
    );

    process.exit(1);
  }

  const report = readJson(
    RESULTS_JSON
  );

  if (!report) {
    process.exit(1);
  }

  fs.mkdirSync(
    INVESTIGATIONS_DIR,
    {
      recursive: true,
    }
  );

  const tests = walkSuites(
    report.suites || []
  );

  let created = 0;

  for (const { suite, spec } of tests) {
    const testRuns =
      spec.tests || [];

    for (const test of testRuns) {
      if (test.status !== 'unexpected') {
        continue;
      }

      const investigation =
        createInvestigation(
          spec,
          test,
          suite
        );

      const safeName =
        spec.title
          .replace(
            /[^a-zA-Z0-9-_]+/g,
            '_'
          )
          .slice(0, 120);

      const outputDirectory =
        path.join(
          INVESTIGATIONS_DIR,
          safeName
        );

      fs.mkdirSync(
        outputDirectory,
        {
          recursive: true,
        }
      );

      const jsonPath =
        path.join(
          outputDirectory,
          'failure.json'
        );

      const markdownPath =
        path.join(
          outputDirectory,
          'context.md'
        );

      fs.writeFileSync(
        jsonPath,
        JSON.stringify(
          investigation,
          null,
          2
        ),
        'utf8'
      );

      fs.writeFileSync(
        markdownPath,
        createMarkdown(
          investigation
        ),
        'utf8'
      );

      console.log(
        `Created investigation: ${spec.title}`
      );

      console.log(
        `  File: ${spec.file}`
      );

      console.log(
        `  Test line: ${spec.line}`
      );

      console.log(
        `  Investigation: ${relativePath(
          outputDirectory
        )}`
      );

      console.log('');

      created += 1;
    }
  }

  console.log('============================');

  console.log(
    `Investigations created: ${created}`
  );

  console.log('============================\n');
}

main();