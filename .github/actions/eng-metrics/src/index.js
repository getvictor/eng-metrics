#!/usr/bin/env node

/**
 * Main entry point for PR pickup time metrics collector
 */

import { loadConfig } from './config.js';
import { MetricsCollector } from './metrics-collector.js';
import logger from './logger.js';

/**
 * Main function
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    // Check for print-only flag in command line arguments
    const printOnlyFlag = args.includes('--print-only');
    
    // Get the configuration path from command line arguments
    // Filter out the --print-only flag if present
    const configPath = args.filter(arg => arg !== '--print-only')[0] || 'config.json';
    
    // Load configuration
    const config = loadConfig(configPath);
    
    // Override printOnly setting if flag is provided
    if (printOnlyFlag) {
      config.printOnly = true;
    }
    
    // Create and run metrics collector
    const metricsCollector = new MetricsCollector(config);
    const metrics = await metricsCollector.run();
    
    if (config.printOnly) {
      logger.info(`Successfully collected and printed ${metrics.length} PR pickup time metrics`);
    } else {
      logger.info(`Successfully collected and uploaded ${metrics.length} PR pickup time metrics to BigQuery`);
    }
    
    // Exit with success
    process.exit(0);
  } catch (err) {
    logger.error('Error running PR pickup time metrics collector', err);
    
    // Exit with error
    process.exit(1);
  }
}

// Run the main function
await main();
