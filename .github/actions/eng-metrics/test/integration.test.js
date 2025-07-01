/**
 * Integration tests for Time to Merge functionality
 */

import { jest } from '@jest/globals';
import { loadConfig } from '../src/config.js';
import GitHubClient from '../src/github-client.js';
import { BigQueryClient } from '../src/bigquery-client.js';
import { MetricsCollector } from '../src/metrics-collector.js';

// Mock the logger
jest.mock('../src/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Time to Merge Integration Tests', () => {
  test('should load configuration with both metrics enabled by default', () => {
    // Set required environment variables
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.SERVICE_ACCOUNT_KEY_PATH = '/fake/path';
    process.env.BIGQUERY_DATASET_ID = 'test_dataset';
    process.env.REPOSITORIES = 'owner/repo';
    process.env.PRINT_ONLY = 'true'; // Avoid BigQuery validation

    const config = loadConfig();

    expect(config.metrics.timeToFirstReview.enabled).toBe(true);
    expect(config.metrics.timeToMerge.enabled).toBe(true);
    expect(config.metrics.timeToFirstReview.tableName).toBe('pr_first_review');
    expect(config.metrics.timeToMerge.tableName).toBe('pr_merge');
  });

  test('should calculate time to merge for a merged PR', () => {
    const githubClient = new GitHubClient('fake-token');

    const mergedPR = {
      number: 123,
      html_url: 'https://github.com/owner/repo/pull/123',
      user: { login: 'testuser' },
      base: {
        ref: 'main',
        repo: {
          owner: { login: 'owner' },
          name: 'repo'
        }
      },
      head: { repo: { full_name: 'owner/repo' } },
      state: 'closed',
      merged_at: '2023-06-15T14:30:00Z'
    };

    const timelineEvents = [
      {
        event: 'ready_for_review',
        created_at: '2023-06-15T10:00:00Z'
      }
    ];

    const result = githubClient.calculateTimeToMerge(mergedPR, timelineEvents);

    expect(result).not.toBeNull();
    expect(result.metricType).toBe('time_to_merge');
    expect(result.prNumber).toBe(123);
    expect(result.mergeTimeSeconds).toBe(16200); // 4.5 hours
    expect(result.repository).toBe('owner/repo');
  });

  test('should get correct table schemas for both metric types', () => {
    // Create client without file validation
    const bigqueryClient = Object.create(BigQueryClient.prototype);

    const firstReviewSchema = bigqueryClient.getSchemaForMetricType('time_to_first_review');
    const mergeSchema = bigqueryClient.getSchemaForMetricType('time_to_merge');

    // Verify first_review schema
    expect(firstReviewSchema.fields).toContainEqual(
      { name: 'pickup_time_seconds', type: 'INTEGER', mode: 'REQUIRED' }
    );
    expect(firstReviewSchema.fields).toContainEqual(
      { name: 'first_review_time', type: 'TIMESTAMP', mode: 'REQUIRED' }
    );

    // Verify pr_merge schema
    expect(mergeSchema.fields).toContainEqual(
      { name: 'merge_time_seconds', type: 'INTEGER', mode: 'REQUIRED' }
    );
    expect(mergeSchema.fields).toContainEqual(
      { name: 'merge_time', type: 'TIMESTAMP', mode: 'REQUIRED' }
    );
  });

  test('should transform metrics correctly based on type', () => {
    const bigqueryClient = Object.create(BigQueryClient.prototype);

    const firstReviewMetric = {
      metricType: 'time_to_first_review',
      reviewDate: '2023-06-15',
      prCreator: 'testuser',
      prUrl: 'https://github.com/owner/repo/pull/123',
      pickupTimeSeconds: 7200,
      repository: 'owner/repo',
      prNumber: 123,
      targetBranch: 'main',
      readyTime: new Date('2023-06-15T10:00:00Z'),
      firstReviewTime: new Date('2023-06-15T12:00:00Z')
    };

    const mergeMetric = {
      metricType: 'time_to_merge',
      mergeDate: '2023-06-15',
      prCreator: 'testuser',
      prUrl: 'https://github.com/owner/repo/pull/123',
      mergeTimeSeconds: 16200,
      repository: 'owner/repo',
      prNumber: 123,
      targetBranch: 'main',
      readyTime: new Date('2023-06-15T10:00:00Z'),
      mergeTime: new Date('2023-06-15T14:30:00Z')
    };

    const firstReviewRow = bigqueryClient.transformMetricsToRow(firstReviewMetric);
    const mergeRow = bigqueryClient.transformMetricsToRow(mergeMetric);

    expect(firstReviewRow.pickup_time_seconds).toBe(7200);
    expect(firstReviewRow.first_review_time).toBe('2023-06-15T12:00:00.000Z');

    expect(mergeRow.merge_time_seconds).toBe(16200);
    expect(mergeRow.merge_time).toBe('2023-06-15T14:30:00.000Z');
  });

  test('should group metrics by type correctly', () => {
    const config = {
      metrics: {
        timeToFirstReview: { enabled: true, tableName: 'pr_first_review' },
        timeToMerge: { enabled: true, tableName: 'pr_merge' }
      }
    };

    const metricsCollector = new MetricsCollector(config);

    const metrics = [
      { metricType: 'time_to_first_review', prNumber: 123 },
      { metricType: 'time_to_merge', prNumber: 123 },
      { metricType: 'time_to_first_review', prNumber: 124 }
    ];

    const grouped = metricsCollector.groupMetricsByType(metrics);

    expect(grouped.time_to_first_review).toHaveLength(2);
    expect(grouped.time_to_merge).toHaveLength(1);
  });

  test('should get correct table names for metric types', () => {
    const config = {
      metrics: {
        timeToFirstReview: { enabled: true, tableName: 'pr_first_review' },
        timeToMerge: { enabled: true, tableName: 'pr_merge' }
      }
    };

    const metricsCollector = new MetricsCollector(config);

    expect(metricsCollector.getTableNameForMetricType('time_to_first_review')).toBe('pr_first_review');
    expect(metricsCollector.getTableNameForMetricType('time_to_merge')).toBe('pr_merge');
  });
});
