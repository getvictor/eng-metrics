/**
 * BigQuery client module for PR pickup time metrics collector
 * Handles authentication and data upload to BigQuery
 */

import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import logger from './logger.js';

/**
 * BigQuery client class
 */
export class BigQueryClient {
  /**
   * Creates a new BigQuery client
   * @param {string} keyFilePath - Path to the service account key file
   */
  constructor(keyFilePath) {
    this.bigquery = null;
    this.initialize(keyFilePath);
  }

  /**
   * Initializes the BigQuery client
   * @param {string} keyFilePath - Path to the service account key file
   */
  initialize(keyFilePath) {
    // Check if the key file exists
    if (!fs.existsSync(keyFilePath)) {
      let err = new Error(`Service account key file not found at ${keyFilePath}`);
      logger.error('Failed to initialize BigQuery client', err);
      throw err;
    }

    try {
      this.bigquery = new BigQuery({
        keyFilename: keyFilePath
      });

      logger.info('BigQuery client initialized');
    } catch (err) {
      logger.error('Failed to initialize BigQuery client', err);
      throw err;
    }
  }

  /**
   * Creates a table if it doesn't exist
   * @param {string} datasetId - BigQuery dataset ID
   * @param {string} tableId - BigQuery table ID
   * @param {Object} schema - BigQuery table schema
   */
  async createTableIfNotExists(datasetId, tableId, schema) {
    try {
      // Get a reference to the dataset
      const dataset = this.bigquery.dataset(datasetId);

      // Check if the dataset exists, create it if it doesn't
      const [datasetExists] = await dataset.exists();

      if (!datasetExists) {
        logger.info(`Dataset ${datasetId} does not exist, creating it`);
        await dataset.create();
        logger.info(`Dataset ${datasetId} created`);
      }

      // Get a reference to the table
      const table = dataset.table(tableId);

      // Check if the table exists, create it if it doesn't
      const [tableExists] = await table.exists();

      if (!tableExists) {
        logger.info(`Table ${tableId} does not exist, creating it`);

        const options = {
          schema: schema,
          timePartitioning: {
            type: 'DAY',
            field: 'first_review_time'
          },
          // Set pr_number as the primary key
          clustering: {
            fields: ['pr_creator']
          }
        };

        await table.create(options);
        logger.info(`Table ${tableId} created`);
      }
    } catch (err) {
      logger.error(`Error creating table ${datasetId}.${tableId}`, err);
      throw err;
    }
  }

  /**
   * Gets the schema for the PR pickup time metrics table
   * @returns {Object} BigQuery table schema
   */
  getTableSchema() {
    return {
      fields: [
        { name: 'review_date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'pr_creator', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_url', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pickup_time_seconds', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'repository', type: 'STRING', mode: 'REQUIRED' },
        { name: 'pr_number', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'target_branch', type: 'STRING', mode: 'REQUIRED' },
        { name: 'ready_time', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'first_review_time', type: 'TIMESTAMP', mode: 'REQUIRED' }
      ]
    };
  }

  /**
   * Transforms PR pickup time metrics to BigQuery row format
   * @param {Object} metrics - PR pickup time metrics
   * @returns {Object} BigQuery row
   */
  transformMetricsToRow(metrics) {
    return {
      review_date: metrics.reviewDate,
      pr_creator: metrics.prCreator,
      pr_url: metrics.prUrl,
      pickup_time_seconds: metrics.pickupTimeSeconds,
      repository: metrics.repository,
      pr_number: metrics.prNumber,
      target_branch: metrics.targetBranch,
      ready_time: metrics.readyTime.toISOString(),
      first_review_time: metrics.firstReviewTime.toISOString()
    };
  }

  /**
   * Checks if metrics already exist in BigQuery for the given PR numbers
   * @param {string} datasetId - BigQuery dataset ID
   * @param {string} tableId - BigQuery table ID
   * @param {Array} prNumbers - Array of PR numbers to check
   * @returns {Object} Object with PR numbers as keys and boolean values indicating if they exist
   */
  async checkExistingMetrics(datasetId, tableId, prNumbers) {
    try {
      // Get a reference to the table
      const table = this.bigquery.dataset(datasetId).table(tableId);

      // Check if the table exists
      const [tableExists] = await table.exists();
      if (!tableExists) {
        // If the table doesn't exist, no metrics exist
        return prNumbers.reduce((acc, prNumber) => {
          acc[prNumber] = false;
          return acc;
        }, {});
      }

      // Create a query to check for existing PR numbers
      const query = `
        SELECT pr_number
        FROM \`${datasetId}.${tableId}\`
        WHERE pr_number IN (${prNumbers.join(',')})
      `;

      // Run the query
      const [rows] = await this.bigquery.query({ query });

      // Create a map of existing PR numbers
      const existingPRs = rows.reduce((acc, row) => {
        acc[row.pr_number] = true;
        return acc;
      }, {});

      // Return a map of all PR numbers with their existence status
      return prNumbers.reduce((acc, prNumber) => {
        acc[prNumber] = !!existingPRs[prNumber];
        return acc;
      }, {});
    } catch (err) {
      logger.error(`Error checking existing metrics in BigQuery ${datasetId}.${tableId}`, err);
      // If there's an error, assume no metrics exist
      return prNumbers.reduce((acc, prNumber) => {
        acc[prNumber] = false;
        return acc;
      }, {});
    }
  }

  /**
   * Uploads metrics to BigQuery
   * @param {string} datasetId - BigQuery dataset ID
   * @param {string} tableId - BigQuery table ID
   * @param {Array} metrics - Array of PR pickup time metrics
   */
  async uploadMetrics(datasetId, tableId, metrics) {
    try {
      if (!metrics || metrics.length === 0) {
        logger.warn('No metrics to upload');
        return;
      }

      logger.info(`Uploading ${metrics.length} metrics to BigQuery`);

      // Ensure the table exists with the correct schema
      await this.createTableIfNotExists(datasetId, tableId, this.getTableSchema());

      // Get all PR numbers from the metrics
      const prNumbers = metrics.map(metric => metric.prNumber);

      // Check which PR numbers already exist in BigQuery
      const existingMetrics = await this.checkExistingMetrics(datasetId, tableId, prNumbers);

      // Filter out metrics that already exist
      const newMetrics = metrics.filter(metric => !existingMetrics[metric.prNumber]);

      if (newMetrics.length === 0) {
        logger.info('All metrics already exist in BigQuery, nothing to upload');
        return;
      }

      logger.info(`Uploading ${newMetrics.length} new metrics to BigQuery (${metrics.length - newMetrics.length} already exist)`);

      // Transform metrics to BigQuery row format
      const rows = newMetrics.map(metric => this.transformMetricsToRow(metric));

      // Get a reference to the table
      const table = this.bigquery.dataset(datasetId).table(tableId);

      // Upload the rows to BigQuery
      const [apiResponse] = await table.insert(rows);

      logger.info(`Successfully uploaded ${newMetrics.length} metrics to BigQuery`, {
        datasetId,
        tableId,
        insertedRows: newMetrics.length,
        skippedRows: metrics.length - newMetrics.length
      });

      return apiResponse;
    } catch (err) {
      logger.error(`Error uploading metrics to BigQuery ${datasetId}.${tableId}`, err);

      // Log more details about the error if it's an insertion error
      if (err.name === 'PartialFailureError' && err.errors && err.errors.length > 0) {
        err.errors.forEach((error, index) => {
          logger.error(`Row ${index} error:`, { error });
        });
      }

      throw err;
    }
  }
}

export default BigQueryClient;
