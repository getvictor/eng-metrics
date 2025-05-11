/**
 * Configuration module for PR pickup time metrics collector
 * Loads and validates configuration from files and environment variables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import logger from './logger.js';

// Load environment variables from .env file
dotenv.config();

// Get the directory name of the current module
path.dirname(fileURLToPath(import.meta.url));
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // Default target branch to track PRs for
  targetBranch: 'main',
  
  // Default BigQuery dataset and table IDs
  bigQueryDatasetId: 'github_metrics',
  bigQueryTableId: 'pr_pickup_time',
  
  // Default time window for fetching PRs (in days)
  lookbackDays: 30,
  
  // Default print-only mode (false = upload to BigQuery, true = print to console)
  printOnly: false
};

/**
 * Loads configuration from a JSON file
 * @param {string} configPath - Path to the configuration file
 * @returns {Object} Configuration object
 */
const loadConfigFromFile = (configPath) => {
  try {
    const resolvedPath = path.resolve(process.cwd(), configPath);
    logger.info(`Loading configuration from ${resolvedPath}`);
    
    if (!fs.existsSync(resolvedPath)) {
      logger.warn(`Configuration file not found at ${resolvedPath}`);
      return {};
    }
    
    const configData = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(configData);
  } catch (err) {
    logger.error(`Error loading configuration from file: ${configPath}`, err);
    return {};
  }
};

/**
 * Loads configuration from environment variables
 * @returns {Object} Configuration object
 */
const loadConfigFromEnv = () => {
  // Parse repositories from environment variable if provided
  const repositories = process.env.REPOSITORIES
    ? process.env.REPOSITORIES.split(',').map(repo => repo.trim())
    : undefined;

  return {
    repositories,
    githubToken: process.env.GITHUB_TOKEN,
    bigQueryProjectId: process.env.BIGQUERY_PROJECT_ID,
    bigQueryDatasetId: process.env.BIGQUERY_DATASET_ID,
    bigQueryTableId: process.env.BIGQUERY_TABLE_ID,
    serviceAccountKeyPath: process.env.SERVICE_ACCOUNT_KEY_PATH,
    targetBranch: process.env.TARGET_BRANCH,
    printOnly: process.env.PRINT_ONLY === 'true'
  };
};

/**
 * Validates the configuration
 * @param {Object} config - Configuration object
 * @returns {boolean} True if configuration is valid, false otherwise
 */
const validateConfig = (config) => {
  // Always required fields
  const requiredFields = [
    'repositories',
    'githubToken'
  ];
  
  // Fields required only when not in print-only mode
  if (!config.printOnly) {
    requiredFields.push('bigQueryProjectId', 'serviceAccountKeyPath');
  }
  
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    logger.error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    return false;
  }
  
  // Validate repositories array
  if (!Array.isArray(config.repositories) || config.repositories.length === 0) {
    logger.error('Configuration must include at least one repository');
    return false;
  }
  
  // Validate repository format (owner/repo)
  const invalidRepos = config.repositories.filter(repo => {
    return typeof repo !== 'string' || !repo.includes('/');
  });
  
  if (invalidRepos.length > 0) {
    logger.error(`Invalid repository format: ${invalidRepos.join(', ')}`);
    return false;
  }
  
  return true;
};

/**
 * Loads and validates configuration
 * @param {string} [configPath='config.json'] - Path to the configuration file
 * @returns {Object} Configuration object
 */
export const loadConfig = (configPath = 'config.json') => {
  // Load configuration from file
  const fileConfig = loadConfigFromFile(configPath);
  
  // Load configuration from environment variables
  const envConfig = loadConfigFromEnv();
  
  // Merge configurations with precedence: env > file > default
  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig
  };
  
  // Filter out undefined values
  Object.keys(config).forEach(key => {
    if (config[key] === undefined) {
      delete config[key];
    }
  });
  
  // Validate configuration
  const isValid = validateConfig(config);
  
  if (!isValid) {
    throw new Error('Invalid configuration');
  }
  
  logger.info('Configuration loaded successfully', {
    repositories: config.repositories,
    targetBranch: config.targetBranch,
    printOnly: config.printOnly,
    ...(config.printOnly ? {} : {
      bigQueryDatasetId: config.bigQueryDatasetId,
      bigQueryTableId: config.bigQueryTableId
    })
  });
  
  return config;
};

export default {
  loadConfig
};