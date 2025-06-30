/**
 * Configuration module for engineering metrics collector
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
  bigQueryTableId: 'first_review',

  // Default time window for fetching PRs (in days)
  lookbackDays: 5,

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
  // Create a config object with only defined values
  const config = {};

  // Parse repositories from environment variable if provided
  if (process.env.REPOSITORIES) {
    config.repositories = process.env.REPOSITORIES.split(',').map(repo => repo.trim());
  }

  // Add other environment variables if they are defined
  if (process.env.GITHUB_TOKEN) config.githubToken = process.env.GITHUB_TOKEN;
  if (process.env.BIGQUERY_PROJECT_ID) config.bigQueryProjectId = process.env.BIGQUERY_PROJECT_ID;
  if (process.env.BIGQUERY_DATASET_ID) config.bigQueryDatasetId = process.env.BIGQUERY_DATASET_ID;
  if (process.env.BIGQUERY_TABLE_ID) config.bigQueryTableId = process.env.BIGQUERY_TABLE_ID;
  if (process.env.SERVICE_ACCOUNT_KEY_PATH) config.serviceAccountKeyPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
  if (process.env.TARGET_BRANCH) config.targetBranch = process.env.TARGET_BRANCH;
  if (process.env.PRINT_ONLY) config.printOnly = process.env.PRINT_ONLY === 'true';

  return config;
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
