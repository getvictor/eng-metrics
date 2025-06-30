/**
 * Tests for configuration module
 */

import { jest } from '@jest/globals';
import { loadConfig, validateConfig } from '../src/config.js';

// Mock the logger
jest.mock('../src/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Config', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.SERVICE_ACCOUNT_KEY_PATH;
    delete process.env.BIGQUERY_DATASET_ID;
    delete process.env.REPOSITORIES;
    delete process.env.LOOKBACK_DAYS;
    delete process.env.TARGET_BRANCH;
    delete process.env.PRINT_ONLY;
    delete process.env.ENABLED_METRICS;
    delete process.env.TIME_TO_FIRST_REVIEW_TABLE;
    delete process.env.TIME_TO_MERGE_TABLE;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    test('should load default configuration', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = 'owner/repo1,owner/repo2';

      const config = loadConfig();

      expect(config).toEqual({
        githubToken: 'test-token',
        serviceAccountKeyPath: '/path/to/key.json',
        bigQueryDatasetId: 'test_dataset',
        bigQueryProjectId: 'engineering-metrics-459517',
        bigQueryTableId: 'first_review',
        repositories: ['owner/repo1', 'owner/repo2'],
        lookbackDays: 5,
        targetBranch: 'main',
        printOnly: false,
        metrics: {
          timeToFirstReview: {
            enabled: true,
            tableName: 'first_review'
          },
          timeToMerge: {
            enabled: true,
            tableName: 'pr_merge'
          }
        }
      });
    });

    test('should override defaults with environment variables', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = 'owner/repo';
      process.env.LOOKBACK_DAYS = '14';
      process.env.TARGET_BRANCH = 'develop';
      process.env.PRINT_ONLY = 'true';
      process.env.ENABLED_METRICS = 'time_to_first_review';
      process.env.TIME_TO_FIRST_REVIEW_TABLE = 'custom_first_review';
      process.env.TIME_TO_MERGE_TABLE = 'custom_pr_merge';

      const config = loadConfig();

      expect(config).toEqual({
        githubToken: 'test-token',
        serviceAccountKeyPath: '/path/to/key.json',
        bigQueryDatasetId: 'test_dataset',
        bigQueryProjectId: 'engineering-metrics-459517',
        bigQueryTableId: 'first_review',
        repositories: ['owner/repo'],
        lookbackDays: 5,
        targetBranch: 'develop',
        printOnly: true,
        metrics: {
          timeToFirstReview: {
            enabled: true,
            tableName: 'custom_first_review'
          },
          timeToMerge: {
            enabled: false,
            tableName: 'custom_pr_merge'
          }
        }
      });
    });

    test('should handle multiple enabled metrics', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = 'owner/repo';
      process.env.ENABLED_METRICS = 'time_to_first_review,time_to_merge';

      const config = loadConfig();

      expect(config.metrics.timeToFirstReview.enabled).toBe(true);
      expect(config.metrics.timeToMerge.enabled).toBe(true);
    });

    test('should handle only time_to_merge enabled', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = 'owner/repo';
      process.env.ENABLED_METRICS = 'time_to_merge';

      const config = loadConfig();

      expect(config.metrics.timeToFirstReview.enabled).toBe(false);
      expect(config.metrics.timeToMerge.enabled).toBe(true);
    });

    test('should trim whitespace from repositories', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = ' owner/repo1 , owner/repo2 , owner/repo3 ';

      const config = loadConfig();

      expect(config.repositories).toEqual(['owner/repo1', 'owner/repo2', 'owner/repo3']);
    });

    test('should trim whitespace from enabled metrics', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/key.json';
      process.env.BIGQUERY_DATASET_ID = 'test_dataset';
      process.env.REPOSITORIES = 'owner/repo';
      process.env.ENABLED_METRICS = ' time_to_first_review , time_to_merge ';

      const config = loadConfig();

      expect(config.metrics.timeToFirstReview.enabled).toBe(true);
      expect(config.metrics.timeToMerge.enabled).toBe(true);
    });
  });

  describe('validateConfig', () => {
    const baseValidConfig = {
      githubToken: 'test-token',
      serviceAccountKeyPath: '/path/to/key.json',
      bigQueryDatasetId: 'test_dataset',
      bigQueryProjectId: 'test-project',
      repositories: ['owner/repo'],
      lookbackDays: 30,
      targetBranch: 'main',
      printOnly: false,
      metrics: {
        timeToFirstReview: {
          enabled: true,
          tableName: 'first_review'
        },
        timeToMerge: {
          enabled: true,
          tableName: 'pr_merge'
        }
      }
    };

    test('should validate correct configuration', () => {
      expect(() => validateConfig(baseValidConfig)).not.toThrow();
    });

    test('should return false for missing GitHub token', () => {
      const config = { ...baseValidConfig, githubToken: '' };
      expect(validateConfig(config)).toBe(false);
    });

    test('should return false for missing service account key path in non-print mode', () => {
      const config = { ...baseValidConfig, serviceAccountKeyPath: '' };
      expect(validateConfig(config)).toBe(false);
    });

    test('should not require service account key path in print-only mode', () => {
      const config = { 
        ...baseValidConfig, 
        serviceAccountKeyPath: '', 
        printOnly: true 
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should return false for missing BigQuery project ID in non-print mode', () => {
      const config = { ...baseValidConfig, bigQueryProjectId: '' };
      expect(validateConfig(config)).toBe(false);
    });

    test('should not require BigQuery dataset ID in print-only mode', () => {
      const config = { 
        ...baseValidConfig, 
        bigQueryDatasetId: '', 
        printOnly: true 
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should return false for empty repositories array', () => {
      const config = { ...baseValidConfig, repositories: [] };
      expect(validateConfig(config)).toBe(false);
    });

    test('should return false for invalid repository format', () => {
      const config = { ...baseValidConfig, repositories: ['invalid-repo'] };
      expect(validateConfig(config)).toBe(false);
    });

    test('should validate lookback days correctly', () => {
      const config = { ...baseValidConfig, lookbackDays: 5 };
      expect(validateConfig(config)).toBe(true);
    });

    test('should return false when no metrics are enabled', () => {
      const config = {
        ...baseValidConfig,
        metrics: {
          timeToFirstReview: { enabled: false, tableName: 'first_review' },
          timeToMerge: { enabled: false, tableName: 'pr_merge' }
        }
      };
      expect(validateConfig(config)).toBe(false);
    });

    test('should return false for missing table name when metric is enabled', () => {
      const config = {
        ...baseValidConfig,
        metrics: {
          timeToFirstReview: { enabled: true, tableName: '' },
          timeToMerge: { enabled: false, tableName: 'pr_merge' }
        }
      };
      expect(validateConfig(config)).toBe(false);
    });

    test('should allow missing table name when metric is disabled', () => {
      const config = {
        ...baseValidConfig,
        metrics: {
          timeToFirstReview: { enabled: true, tableName: 'first_review' },
          timeToMerge: { enabled: false, tableName: '' }
        }
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should validate multiple valid repositories', () => {
      const config = { 
        ...baseValidConfig, 
        repositories: ['owner1/repo1', 'owner2/repo2', 'owner3/repo3'] 
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    test('should throw error for mixed valid and invalid repositories', () => {
      const config = {
        ...baseValidConfig,
        repositories: ['owner1/repo1', 'invalid-repo', 'owner3/repo3']
      };
      expect(validateConfig(config)).toBe(false);
    });
  });
});