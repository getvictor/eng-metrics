/**
 * Engineering metrics collector module
 * Orchestrates the collection and uploading of comprehensive GitHub engineering metrics:
 * - Time to First Review (currently implemented)
 * - Time to Merge (planned)
 * - Time to QA Ready (planned)
 * - Time to Production Ready (planned)
 */

import GitHubClient from './github-client.js';
import BigQueryClient from './bigquery-client.js';
import logger from './logger.js';

/**
 * Metrics collector class
 */
export class MetricsCollector {
  /**
   * Creates a new metrics collector
   * @param {Object} config - Configuration object
   */
  constructor(config) {
    this.config = config;
    this.githubClient = null;
    this.bigqueryClient = null;
  }

  /**
   * Initializes the metrics collector
   */
  async initialize() {
    try {
      logger.info('Initializing metrics collector');
      
      // Initialize GitHub client
      this.githubClient = new GitHubClient(this.config.githubToken);
      
      // Initialize BigQuery client only if not in print-only mode
      if (!this.config.printOnly) {
        this.bigqueryClient = new BigQueryClient(this.config.serviceAccountKeyPath);
      } else {
        logger.info('Running in print-only mode, BigQuery client not initialized');
      }
      
      logger.info('Metrics collector initialized');
    } catch (err) {
      logger.error('Failed to initialize metrics collector', err);
      throw err;
    }
  }

  /**
   * Collects metrics for a single repository
   * @param {string} repository - Repository in the format owner/repo
   * @returns {Array} Array of engineering metrics
   */
  async collectRepositoryMetrics(repository) {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      let err = new Error(`Invalid repository format: ${repository}`);
      logger.error(`Error collecting metrics for ${repository}`, err);
      return [];
    }
    logger.info(`Collecting metrics for ${repository}`);

    try {
      // Calculate the date to fetch PRs from (lookbackDays ago)
      const since = new Date();
      since.setDate(since.getDate() - this.config.lookbackDays);
      
      // Fetch PRs updated since the lookback date
      const pullRequests = await this.githubClient.fetchPullRequests(
        owner,
        repo,
        'all',
        since,
        this.config.targetBranch
      );
      
      logger.info(`Found ${pullRequests.length} PRs for ${repository}`);
      
      // Collect metrics for each PR
      const metrics = [];
      
      for (const pr of pullRequests) {
        try {
          // Fetch PR timeline events
          const timelineEvents = await this.githubClient.fetchPRTimelineEvents(
            owner,
            repo,
            pr.number
          );
          
          // Fetch PR review events
          const reviewEvents = await this.githubClient.fetchPRReviewEvents(
            owner,
            repo,
            pr.number
          );
          
          // Calculate pickup time
          const pickupTimeMetrics = this.githubClient.calculatePickupTime(
            pr,
            timelineEvents,
            reviewEvents
          );
          
          if (pickupTimeMetrics) {
            metrics.push(pickupTimeMetrics);
          }
        } catch (err) {
          logger.error(`Error collecting metrics for PR ${repository}#${pr.number}`, err);
        }
      }
      
      logger.info(`Collected ${metrics.length} metrics for ${repository}`);
      return metrics;
    } catch (err) {
      logger.error(`Error collecting metrics for ${repository}`, err);
      return [];
    }
  }

  /**
   * Collects metrics for all repositories
   * @returns {Array} Array of engineering metrics
   */
  async collectMetrics() {
    try {
      logger.info('Collecting metrics for all repositories');
      
      const allMetrics = [];
      
      // Collect metrics for each repository
      for (const repository of this.config.repositories) {
        const metrics = await this.collectRepositoryMetrics(repository);
        allMetrics.push(...metrics);
      }
      
      logger.info(`Collected ${allMetrics.length} metrics in total`);
      return allMetrics;
    } catch (err) {
      logger.error('Error collecting metrics', err);
      throw err;
    }
  }

  /**
   * Prints metrics to the console in a readable format
   * @param {Array} metrics - Array of engineering metrics
   */
  printMetrics(metrics) {
    try {
      if (!metrics || metrics.length === 0) {
        logger.warn('No metrics to print');
        return;
      }
      
      logger.info(`Printing ${metrics.length} metrics to console`);
      
      // Print metrics in a table format
      console.log('\n=== Engineering Metrics ===\n');
      
      // Sort metrics by pickup time (descending)
      const sortedMetrics = [...metrics].sort((a, b) => b.pickupTimeSeconds - a.pickupTimeSeconds);
      
      // Print each metric
      sortedMetrics.forEach((metric, index) => {
        const hours = Math.floor(metric.pickupTimeSeconds / 3600);
        const minutes = Math.floor((metric.pickupTimeSeconds % 3600) / 60);
        const seconds = metric.pickupTimeSeconds % 60;
        
        console.log(`[${index + 1}] PR: ${metric.repository}#${metric.prNumber}`);
        console.log(`    URL: ${metric.prUrl}`);
        console.log(`    Creator: ${metric.prCreator}`);
        console.log(`    Ready Time: ${metric.readyTime.toISOString()} (${metric.readyEventType})`);
        console.log(`    First Review Time: ${metric.firstReviewTime.toISOString()}`);
        console.log(`    Pickup Time: ${hours}h ${minutes}m ${seconds}s (${metric.pickupTimeSeconds} seconds)`);
        console.log('');
      });
      
      // Print summary statistics
      const totalPickupTime = metrics.reduce((sum, metric) => sum + metric.pickupTimeSeconds, 0);
      const avgPickupTime = totalPickupTime / metrics.length;
      const avgHours = Math.floor(avgPickupTime / 3600);
      const avgMinutes = Math.floor((avgPickupTime % 3600) / 60);
      const avgSeconds = Math.floor(avgPickupTime % 60);
      
      console.log('=== Summary Statistics ===');
      console.log(`Total PRs: ${metrics.length}`);
      console.log(`Average Pickup Time: ${avgHours}h ${avgMinutes}m ${avgSeconds}s (${Math.floor(avgPickupTime)} seconds)`);
      console.log('');
      
      logger.info('Metrics printed successfully');
    } catch (err) {
      logger.error('Error printing metrics', err);
      throw err;
    }
  }

  /**
   * Uploads metrics to BigQuery
   * @param {Array} metrics - Array of engineering metrics
   */
  async uploadMetrics(metrics) {
    try {
      if (!metrics || metrics.length === 0) {
        logger.warn('No metrics to upload');
        return;
      }
      
      logger.info(`Uploading ${metrics.length} metrics to BigQuery`);
      
      await this.bigqueryClient.uploadMetrics(
        this.config.bigQueryDatasetId,
        this.config.bigQueryTableId,
        metrics
      );
      
      logger.info('Metrics uploaded successfully');
    } catch (err) {
      logger.error('Error uploading metrics to BigQuery', err);
      throw err;
    }
  }

  /**
   * Runs the metrics collection and upload process
   */
  async run() {
    try {
      logger.info('Starting engineering metrics collection');
      
      // Initialize the metrics collector
      await this.initialize();
      
      // Collect metrics
      const metrics = await this.collectMetrics();
      
      if (this.config.printOnly) {
        // Print metrics to console
        this.printMetrics(metrics);
      } else {
        // Upload metrics to BigQuery
        await this.uploadMetrics(metrics);
      }
      
      logger.info('Engineering metrics collection completed successfully');
      return metrics;
    } catch (err) {
      logger.error('Error running engineering metrics collection', err);
      throw err;
    }
  }
}

export default MetricsCollector;