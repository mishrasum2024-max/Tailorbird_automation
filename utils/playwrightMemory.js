const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../memory');
const TEST_CASES_FILE = path.join(MEMORY_DIR, 'testCases.json');
const EXECUTION_LOG_FILE = path.join(MEMORY_DIR, 'executionLog.json');
const PATTERNS_FILE = path.join(MEMORY_DIR, 'patterns.json');
const FIX_HISTORY_FILE = path.join(MEMORY_DIR, 'fixHistory.json');

// Ensure memory directory exists
function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function memoryKey(ticketId, testCaseId) {
  return `${ticketId}::${testCaseId}`;
}

// Normalize an error message into a stable signature so the same
// underlying bug (hit on different tickets/runs, with different
// timestamps/ids embedded in the message) maps to one fixHistory entry.
function normalizeSignature(message) {
  return String(message || '')
    .replace(/\s+/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z-]+/g, '<timestamp>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .trim()
    .slice(0, 160);
}

class PlaywrightMemory {
  constructor() {
    ensureMemoryDir();
  }

  // Record when a test case is generated from a ticket.
  // Keyed by ticketId+testCaseId so selection/execution recorded later
  // for the same test case land on the same entry, and re-generating
  // the same ticket updates it in place instead of duplicating.
  recordTestCaseGeneration(ticketId, testCaseId, title, type) {
    const testCases = this.loadTestCases();
    const key = memoryKey(ticketId, testCaseId);

    testCases[key] = {
      ...(testCases[key] || {}),
      id: testCaseId,
      ticketId,
      title: title || null,
      type: type || null,
      generatedAt: new Date().toISOString(),
      status: 'created', // created | selected | running | passed | failed
      selectedBy: testCases[key]?.selectedBy || null,
      selectedAt: testCases[key]?.selectedAt || null,
    };

    this.saveTestCases(testCases);
    return testCases[key];
  }

  // Record when a human selects a test case (e.g. via Slack).
  recordTestCaseSelection(ticketId, testCaseId, selectedBy) {
    const testCases = this.loadTestCases();
    const key = memoryKey(ticketId, testCaseId);

    testCases[key] = testCases[key] || {
      id: testCaseId,
      ticketId,
      title: null,
      type: null,
      generatedAt: null,
      status: 'created',
    };

    testCases[key].status = 'selected';
    testCases[key].selectedBy = selectedBy || null;
    testCases[key].selectedAt = new Date().toISOString();

    this.saveTestCases(testCases);
    return testCases[key];
  }

  // Record test execution start
  recordTestStart(ticketId, testCaseId) {
    const log = this.loadExecutionLog();
    const key = memoryKey(ticketId, testCaseId);

    const execution = {
      testCaseId,
      ticketId,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running',
      errorMessage: null,
      duration: 0,
    };

    log[key] = log[key] || [];
    log[key].push(execution);

    this.saveExecutionLog(log);
    return execution;
  }

  // Record test execution result
  recordTestResult(ticketId, testCaseId, passed, errorMessage = null) {
    const log = this.loadExecutionLog();
    const key = memoryKey(ticketId, testCaseId);

    if (!log[key] || log[key].length === 0) {
      // Result reported without a matching start — record it directly.
      this.recordTestStart(ticketId, testCaseId);
    }

    const executions = this.loadExecutionLog()[key];
    const lastExecution = executions[executions.length - 1];

    lastExecution.endTime = new Date().toISOString();
    lastExecution.status = passed ? 'passed' : 'failed';
    lastExecution.errorMessage = errorMessage;
    lastExecution.duration = new Date(lastExecution.endTime) - new Date(lastExecution.startTime);

    const fullLog = this.loadExecutionLog();
    fullLog[key] = executions;
    this.saveExecutionLog(fullLog);

    if (!passed && errorMessage) {
      this.trackErrorPattern(key, errorMessage);
    }

    const testCases = this.loadTestCases();
    if (testCases[key]) {
      testCases[key].status = passed ? 'passed' : 'failed';
      this.saveTestCases(testCases);
    }
  }

  // Track error patterns for smarter test generation
  trackErrorPattern(key, errorMessage) {
    const patterns = this.loadPatterns();

    if (!patterns.errorPatterns) {
      patterns.errorPatterns = {};
    }

    const errorKey = errorMessage.substring(0, 100); // Use first 100 chars as key
    patterns.errorPatterns[errorKey] = {
      count: (patterns.errorPatterns[errorKey]?.count || 0) + 1,
      testCases: [...new Set([...(patterns.errorPatterns[errorKey]?.testCases || []), key])],
      lastOccurrence: new Date().toISOString(),
    };

    this.savePatterns(patterns);
  }

  // Record a confirmed root-cause fix: a test case that was FAILING and is
  // now PASSING after a specific change. Keyed by a normalized signature of
  // the error it fixed, so the same underlying bug recurring on a different
  // ticket consolidates into one entry instead of duplicating.
  //
  // This is intentionally append/merge-only — entries are never deleted or
  // expired, so this history stays available forever across GitHub Actions
  // runs (see scripts/ai-agent/persist-memory.js, which commits it to main).
  recordFix({ ticketId, testCaseId, component, errorSignature, rootCause, fixApplied, filesChanged = [] }) {
    const history = this.loadFixHistory();
    const signature = normalizeSignature(errorSignature) || memoryKey(ticketId, testCaseId);
    const now = new Date().toISOString();

    const occurrence = {
      ticketId,
      testCaseId,
      fixedAt: now,
      fixApplied: fixApplied || null,
      filesChanged,
    };

    const existing = history[signature];

    if (existing) {
      existing.occurrences += 1;
      existing.lastFixedAt = now;
      existing.rootCause = rootCause || existing.rootCause;
      existing.fixApplied = fixApplied || existing.fixApplied;
      existing.component = component || existing.component;
      existing.filesChanged = Array.from(
        new Set([...(existing.filesChanged || []), ...filesChanged])
      );
      existing.tickets = Array.from(new Set([...(existing.tickets || []), ticketId]));
      // Full per-occurrence log is kept forever — never trimmed — so the
      // complete history of every time this bug was hit and fixed stays
      // available to future automation runs.
      existing.occurrenceLog = [...(existing.occurrenceLog || []), occurrence];
    } else {
      history[signature] = {
        errorSignature: signature,
        component: component || null,
        rootCause: rootCause || null,
        fixApplied: fixApplied || null,
        filesChanged,
        occurrences: 1,
        firstSeenAt: now,
        lastFixedAt: now,
        tickets: [ticketId],
        occurrenceLog: [occurrence],
      };
    }

    this.saveFixHistory(history);
    return history[signature];
  }

  // Find prior fix-history entries relevant to the CURRENT ticket/failure,
  // for injecting a small, token-budgeted digest into the Claude prompt.
  // The full history stays intact in fixHistory.json regardless of what
  // this returns — this only decides what's worth spending prompt tokens
  // on right now.
  findRelevantFixes({ component, errorMessage, keywords = [], limit = 5 }) {
    const history = this.loadFixHistory();
    const entries = Object.values(history);

    if (!entries.length) {
      return [];
    }

    const normalizedError = normalizeSignature(errorMessage).toLowerCase();
    const lowerComponent = (component || '').toLowerCase();
    const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(Boolean);

    const scored = entries.map(entry => {
      let score = 0;
      const entrySignature = (entry.errorSignature || '').toLowerCase();

      if (normalizedError && entrySignature) {
        const shorter = Math.min(normalizedError.length, entrySignature.length, 60);
        if (
          shorter > 10 &&
          (entrySignature.includes(normalizedError.slice(0, shorter)) ||
            normalizedError.includes(entrySignature.slice(0, shorter)))
        ) {
          score += 5;
        }
      }

      if (lowerComponent && entry.component && entry.component.toLowerCase().includes(lowerComponent)) {
        score += 3;
      }

      const haystack = `${entry.rootCause || ''} ${entry.fixApplied || ''} ${entry.component || ''}`.toLowerCase();
      lowerKeywords.forEach(keyword => {
        if (haystack.includes(keyword)) {
          score += 1;
        }
      });

      // Slight boost for recurring issues — they're the ones most worth flagging.
      score += Math.min(entry.occurrences || 1, 5) * 0.2;

      return { entry, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.occurrences - a.entry.occurrences)
      .slice(0, limit)
      .map(s => s.entry);
  }

  loadFixHistory() {
    try {
      if (fs.existsSync(FIX_HISTORY_FILE)) {
        return JSON.parse(fs.readFileSync(FIX_HISTORY_FILE, 'utf-8'));
      }
    } catch (error) {
      console.warn('Error loading fix history:', error.message);
    }
    return {};
  }

  saveFixHistory(history) {
    try {
      ensureMemoryDir();
      fs.writeFileSync(FIX_HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error saving fix history:', error.message);
    }
  }

  // Get all selected/pending tests for execution
  getPendingTests() {
    const testCases = this.loadTestCases();
    return Object.values(testCases).filter(tc => tc.status === 'selected');
  }

  // Get execution history for AI context
  getExecutionSummary() {
    const log = this.loadExecutionLog();
    const testCases = this.loadTestCases();

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    const recentFailures = [];

    Object.entries(log).forEach(([key, executions]) => {
      const lastExecution = executions[executions.length - 1];
      totalTests++;

      if (lastExecution.status === 'passed') {
        passedTests++;
      } else if (lastExecution.status === 'failed') {
        failedTests++;
        recentFailures.push({
          testCaseId: testCases[key]?.id,
          title: testCases[key]?.title,
          error: lastExecution.errorMessage,
          timestamp: lastExecution.endTime,
        });
      }
    });

    return {
      totalTests,
      passedTests,
      failedTests,
      passRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0,
      recentFailures: recentFailures.slice(-5),
    };
  }

  // Load/Save methods
  loadTestCases() {
    try {
      if (fs.existsSync(TEST_CASES_FILE)) {
        return JSON.parse(fs.readFileSync(TEST_CASES_FILE, 'utf-8'));
      }
    } catch (error) {
      console.warn('Error loading test cases:', error.message);
    }
    return {};
  }

  saveTestCases(testCases) {
    try {
      ensureMemoryDir();
      fs.writeFileSync(TEST_CASES_FILE, JSON.stringify(testCases, null, 2));
    } catch (error) {
      console.error('Error saving test cases:', error.message);
    }
  }

  loadExecutionLog() {
    try {
      if (fs.existsSync(EXECUTION_LOG_FILE)) {
        return JSON.parse(fs.readFileSync(EXECUTION_LOG_FILE, 'utf-8'));
      }
    } catch (error) {
      console.warn('Error loading execution log:', error.message);
    }
    return {};
  }

  saveExecutionLog(log) {
    try {
      ensureMemoryDir();
      fs.writeFileSync(EXECUTION_LOG_FILE, JSON.stringify(log, null, 2));
    } catch (error) {
      console.error('Error saving execution log:', error.message);
    }
  }

  loadPatterns() {
    try {
      if (fs.existsSync(PATTERNS_FILE)) {
        return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf-8'));
      }
    } catch (error) {
      console.warn('Error loading patterns:', error.message);
    }
    return { errorPatterns: {} };
  }

  savePatterns(patterns) {
    try {
      ensureMemoryDir();
      fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
    } catch (error) {
      console.error('Error saving patterns:', error.message);
    }
  }
}

module.exports = new PlaywrightMemory();
