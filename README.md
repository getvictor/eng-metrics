# PR Pickup Time Metrics Collector

A tool to collect GitHub PR pickup time metrics and upload them to BigQuery. This tool can be used as a standalone application or as a GitHub Action.

## What is PR Pickup Time?

PR Pickup Time is defined as the time between when a PR is marked as "Ready for Review" and when a reviewer starts looking at it. Specifically:

- **Start Time**: When a PR is marked as "Ready for Review" - this can be:
  - When a PR is created as a non-draft PR
  - When a draft PR is converted to ready for review
  - If multiple ready_for_review events exist, the tool uses the most recent one that occurred before the first review
- **End Time**: When the first review submission occurs (comment, approval, or changes requested)
- **Pickup Time**: The time difference between these two events, excluding weekends

This metric helps teams understand how quickly PRs are being reviewed, which can be a key indicator of team efficiency and collaboration.

## Features

- Collects PR pickup time metrics from GitHub repositories
- Uploads metrics to Google BigQuery for analysis
- Configurable via JSON file and environment variables
- Can run as a standalone application or as a GitHub Action
- Supports multiple repositories
- Only tracks PRs targeting the main branch
- Excludes weekends from pickup time calculations
- Supports print-only mode for testing without BigQuery

## Prerequisites

- Node.js 16 or higher
- A GitHub token with `repo` scope
- A Google Cloud project with BigQuery enabled
- A Google Cloud service account with BigQuery permissions

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/pickup-time.git
cd pickup-time

# Install dependencies
npm install
```

## Configuration

### Configuration File

Create a `config.json` file with the following structure:

```json
{
  "repositories": [
    "owner/repo1",
    "owner/repo2"
  ],
  "targetBranch": "main",
  "bigQueryDatasetId": "github_metrics",
  "bigQueryTableId": "first_review",
  "lookbackDays": 5,
  "serviceAccountKeyPath": "./service-account-key.json",
  "printOnly": false
}
```

### Environment Variables

You can also configure the tool using environment variables:

- `GITHUB_TOKEN`: GitHub token with repo scope
- `REPOSITORIES`: Comma-separated list of repositories to track (optional, overrides config.json)
- `BIGQUERY_PROJECT_ID`: Google Cloud project ID
- `BIGQUERY_DATASET_ID`: BigQuery dataset ID (optional, defaults to config.json)
- `BIGQUERY_TABLE_ID`: BigQuery table ID (optional, defaults to config.json)
- `SERVICE_ACCOUNT_KEY_PATH`: Path to the service account key file (optional, defaults to config.json)
- `TARGET_BRANCH`: Target branch to track PRs for (optional, default: main)
- `PRINT_ONLY`: Set to 'true' to print metrics to console instead of uploading to BigQuery

Create a `.env` file based on the provided `.env.example` to set these variables.

## Usage

### As a Standalone Application

```bash
# Run with default config.json
npm start

# Run with a custom config file
npm start -- path/to/config.json

# Run in print-only mode (no BigQuery upload)
npm start -- --print-only

# Run with a custom config file in print-only mode
npm start -- path/to/config.json --print-only

# Using the dedicated print-only script
npm run start:print

# Using the test script
./test-print-only.sh
```

### As a GitHub Action

Add the following workflow file to your repository:

```yaml
name: Collect PR Pickup Time Metrics

on:
  schedule:
    - cron: '0 0 * * *'  # Run daily at midnight
  workflow_dispatch:      # Allow manual triggering

jobs:
  collect-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
      
      - name: Create service account key file
        run: echo "${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}" > service-account-key.json
      
      - name: Collect and upload metrics
        uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          config-path: './config.json'
          bigquery-project: ${{ secrets.BIGQUERY_PROJECT_ID }}
          bigquery-dataset: 'github_metrics'
          bigquery-table: 'first_review'
          target-branch: 'main'
          lookback-days: '5'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BIGQUERY_PROJECT_ID: ${{ secrets.BIGQUERY_PROJECT_ID }}
          SERVICE_ACCOUNT_KEY_PATH: './service-account-key.json'
```

#### How the GitHub Action Works

1. **Service Account Key Handling**:
   - The workflow writes the `GCP_SERVICE_ACCOUNT_KEY` secret directly to a file
   - It verifies that the file contains valid JSON using `jq`
   - It then sets the `SERVICE_ACCOUNT_KEY_PATH` environment variable to point to this file
   - The application uses this environment variable to locate the service account key file

   **Important**: The service account key should be stored as a JSON string in the GitHub secret. Copy the entire contents of your service account key JSON file to the secret value.

2. **Configuration**:
   - The workflow passes configuration values as both input parameters and environment variables
   - Input parameters are used by the GitHub Action wrapper
   - Environment variables are used directly by the application

Make sure to set the following secrets in your repository:

- `GITHUB_TOKEN`: GitHub token with repo scope (automatically provided by GitHub Actions)
- `GCP_SERVICE_ACCOUNT_KEY`: JSON service account key as a string
- `BIGQUERY_PROJECT_ID`: Google Cloud project ID

## BigQuery Schema

The tool creates a BigQuery table with the following schema:

| Field | Type | Description |
|-------|------|-------------|
| review_date | DATE | Date when the reviewer started looking at the PR |
| pr_creator | STRING | GitHub username of the PR creator |
| pr_url | STRING | HTTP link to the PR |
| pickup_time_seconds | INTEGER | Time in seconds from "Ready for Review" to first review (excluding weekends) |
| repository | STRING | Repository name (owner/repo) |
| pr_number | INTEGER | PR number (used as primary key) |
| target_branch | STRING | Branch the PR is targeting (always "main") |
| ready_time | TIMESTAMP | Timestamp when PR was marked ready for review |
| first_review_time | TIMESTAMP | Timestamp of first review activity |

The table uses `pr_number` as the primary key, which means:
- Each PR is only stored once in the database
- If a PR already exists in the database, it will not be updated or overwritten
- This ensures that the first calculation of pickup time for a PR is preserved

## Print-Only Mode

The tool supports a print-only mode that prints metrics to the console instead of uploading them to BigQuery. This is useful for testing without setting up BigQuery.

To enable print-only mode:

1. Set `printOnly: true` in your config.json file, OR
2. Set the `PRINT_ONLY=true` environment variable, OR
3. Use the `--print-only` command line flag

When running in print-only mode, you don't need to provide BigQuery credentials or configuration.

## Example Queries

Once you have data in BigQuery, you can run queries like:

```sql
-- Average pickup time by repository
SELECT
  repository,
  AVG(pickup_time_seconds) / 3600 AS avg_pickup_time_hours
FROM
  `your-project.github_metrics.first_review`
GROUP BY
  repository
ORDER BY
  avg_pickup_time_hours;

-- Pickup time trend over time
SELECT
  DATE_TRUNC(review_date, WEEK) AS week,
  AVG(pickup_time_seconds) / 3600 AS avg_pickup_time_hours
FROM
  `your-project.github_metrics.first_review`
GROUP BY
  week
ORDER BY
  week;
```

## Development

### Running Tests

```bash
npm test
```

The project includes unit tests for the core functionality, including table-driven tests for the PR pickup time calculation logic. These tests verify that:

- PRs created as non-draft are handled correctly
- PRs converted from draft to ready are handled correctly
- Multiple ready_for_review events are handled correctly (using the most recent one before review)
- Edge cases like no reviews or no ready events are handled properly
- PRs with multiple reviews are handled correctly (only the first review is counted)
- Weekend days are properly excluded from pickup time calculations

### Linting

```bash
npm run lint
```

## License

ISC
