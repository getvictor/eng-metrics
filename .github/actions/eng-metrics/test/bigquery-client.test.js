/**
 * Tests for BigQuery client module
 */

import { jest } from '@jest/globals';
import { BigQueryClient } from '../src/bigquery-client.js';

// Mock the logger
jest.mock('../src/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true)
}));

// Mock @google-cloud/bigquery
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn(() => ({
    dataset: jest.fn(),
    query: jest.fn()
  }))
}));

describe('BigQueryClient', () => {
  let bigqueryClient;
  let mockBigQuery;
  let mockDataset;
  let mockTable;

  beforeEach(() => {
    mockTable = {
      exists: jest.fn(() => [true]),
      create: jest.fn(),
      insert: jest.fn(() => [{}])
    };

    mockDataset = {
      exists: jest.fn(() => [true]),
      create: jest.fn(),
      table: jest.fn(() => mockTable)
    };

    mockBigQuery = {
      dataset: jest.fn(() => mockDataset),
      query: jest.fn(() => [[]])
    };

    // Create client without calling constructor to avoid file check
    bigqueryClient = Object.create(BigQueryClient.prototype);
    bigqueryClient.bigquery = mockBigQuery;
  });

  describe('getTableSchema', () => {
    test('should return first_review table schema', () => {
      const schema = bigqueryClient.getTableSchema('first_review');

      expect(schema.fields).toEqual([
        { name: 'review_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'pr_creator', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_url', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pickup_time_seconds', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'repository', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_number', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'target_branch', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ready_time', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'first_review_time', type: 'TIMESTAMP', mode: 'REQUIRED' }
      ]);
    });

    test('should return pr_merge table schema', () => {
      const schema = bigqueryClient.getTableSchema('pr_merge');

      expect(schema.fields).toEqual([
        { name: 'merge_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'pr_creator', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_url', type: 'STRING', mode: 'REQUIRED' },
        { name: 'merge_time_seconds', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'repository', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_number', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'target_branch', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ready_time', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'merge_time', type: 'TIMESTAMP', mode: 'REQUIRED' }
      ]);
    });

    test('should throw error for unknown table', () => {
      expect(() => {
        bigqueryClient.getTableSchema('unknown_table');
      }).toThrow('Unknown table: unknown_table');
    });
  });

  describe('getTableConfiguration', () => {
    test('should return first_review table configuration', () => {
      const config = bigqueryClient.getTableConfiguration('first_review');

      expect(config).toEqual({
        timePartitioning: {
          type: 'DAY',
          field: 'first_review_time'
        },
        clustering: {
          fields: ['pr_creator']
        }
      });
    });

    test('should return pr_merge table configuration', () => {
      const config = bigqueryClient.getTableConfiguration('pr_merge');

      expect(config).toEqual({
        timePartitioning: {
          type: 'DAY',
          field: 'merge_time'
        },
        clustering: {
          fields: ['pr_creator']
        }
      });
    });

    test('should throw error for unknown table configuration', () => {
      expect(() => {
        bigqueryClient.getTableConfiguration('unknown_table');
      }).toThrow('Unknown table configuration for: unknown_table');
    });
  });

  describe('transformMetricsToRow', () => {
    test('should transform time_to_first_review metrics', () => {
      const metrics = {
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

      const row = bigqueryClient.transformMetricsToRow(metrics);

      expect(row).toEqual({
        review_date: '2023-06-15',
        pr_creator: 'testuser',
        pr_url: 'https://github.com/owner/repo/pull/123',
        pickup_time_seconds: 7200,
        repository: 'owner/repo',
        pr_number: 123,
        target_branch: 'main',
        ready_time: '2023-06-15T10:00:00.000Z',
        first_review_time: '2023-06-15T12:00:00.000Z'
      });
    });

    test('should transform time_to_merge metrics', () => {
      const metrics = {
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

      const row = bigqueryClient.transformMetricsToRow(metrics);

      expect(row).toEqual({
        merge_date: '2023-06-15',
        pr_creator: 'testuser',
        pr_url: 'https://github.com/owner/repo/pull/123',
        merge_time_seconds: 16200,
        repository: 'owner/repo',
        pr_number: 123,
        target_branch: 'main',
        ready_time: '2023-06-15T10:00:00.000Z',
        merge_time: '2023-06-15T14:30:00.000Z'
      });
    });

    test('should throw error for unknown metric type', () => {
      const metrics = {
        metricType: 'unknown_type'
      };

      expect(() => {
        bigqueryClient.transformMetricsToRow(metrics);
      }).toThrow('Unknown metric type: unknown_type');
    });
  });

  describe('createTableIfNotExists', () => {
    test('should create table with correct configuration for first_review', async () => {
      mockTable.exists.mockResolvedValue([false]);
      const schema = { fields: [] };

      await bigqueryClient.createTableIfNotExists('test_dataset', 'first_review', schema);

      expect(mockTable.create).toHaveBeenCalledWith({
        schema: schema,
        timePartitioning: {
          type: 'DAY',
          field: 'first_review_time'
        },
        clustering: {
          fields: ['pr_creator']
        }
      });
    });

    test('should create table with correct configuration for pr_merge', async () => {
      mockTable.exists.mockResolvedValue([false]);
      const schema = { fields: [] };

      await bigqueryClient.createTableIfNotExists('test_dataset', 'pr_merge', schema);

      expect(mockTable.create).toHaveBeenCalledWith({
        schema: schema,
        timePartitioning: {
          type: 'DAY',
          field: 'merge_time'
        },
        clustering: {
          fields: ['pr_creator']
        }
      });
    });

    test('should not create table if it already exists', async () => {
      mockTable.exists.mockResolvedValue([true]);
      const schema = { fields: [] };

      await bigqueryClient.createTableIfNotExists('test_dataset', 'first_review', schema);

      expect(mockTable.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadMetrics', () => {
    test('should upload metrics with correct schema', async () => {
      const metrics = [
        {
          metricType: 'time_to_first_review',
          prNumber: 123,
          reviewDate: '2023-06-15',
          prCreator: 'testuser',
          prUrl: 'https://github.com/owner/repo/pull/123',
          pickupTimeSeconds: 7200,
          repository: 'owner/repo',
          targetBranch: 'main',
          readyTime: new Date('2023-06-15T10:00:00Z'),
          firstReviewTime: new Date('2023-06-15T12:00:00Z')
        }
      ];

      await bigqueryClient.uploadMetrics('test_dataset', 'first_review', metrics);

      expect(mockTable.insert).toHaveBeenCalledWith([
        {
          review_date: '2023-06-15',
          pr_creator: 'testuser',
          pr_url: 'https://github.com/owner/repo/pull/123',
          pickup_time_seconds: 7200,
          repository: 'owner/repo',
          pr_number: 123,
          target_branch: 'main',
          ready_time: '2023-06-15T10:00:00.000Z',
          first_review_time: '2023-06-15T12:00:00.000Z'
        }
      ]);
    });

    test('should handle empty metrics array', async () => {
      await bigqueryClient.uploadMetrics('test_dataset', 'first_review', []);

      expect(mockTable.insert).not.toHaveBeenCalled();
    });

    test('should filter out existing metrics', async () => {
      const metrics = [
        {
          metricType: 'time_to_first_review',
          prNumber: 123,
          reviewDate: '2023-06-15',
          prCreator: 'testuser',
          prUrl: 'https://github.com/owner/repo/pull/123',
          pickupTimeSeconds: 7200,
          repository: 'owner/repo',
          targetBranch: 'main',
          readyTime: new Date('2023-06-15T10:00:00Z'),
          firstReviewTime: new Date('2023-06-15T12:00:00Z')
        }
      ];

      // Mock existing metrics check to return that PR 123 already exists
      mockBigQuery.query.mockResolvedValue([[{ pr_number: 123 }]]);

      await bigqueryClient.uploadMetrics('test_dataset', 'first_review', metrics);

      expect(mockTable.insert).not.toHaveBeenCalled();
    });
  });
});