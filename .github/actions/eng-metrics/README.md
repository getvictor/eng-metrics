# Engineering metrics collector

A comprehensive tool to collect GitHub engineering metrics and upload them to BigQuery. This tool can be used as a standalone application or as a GitHub Action to track various development workflow metrics.

## Supported Metrics

This tool collects the following engineering metrics:

### 1. Time to First Review
Previously known as "PR Pickup Time" - measures the time between when a PR is marked as "Ready for Review" and when a reviewer has submitted a review.

- **Start Time**: When a PR is marked as "Ready for Review" - this can be:
  - When a PR is created as a non-draft PR
  - When a draft PR is converted to ready for review
  - If multiple ready_for_review events exist, the tool uses the most recent one that occurred before the first review
- **End Time**: When the first review submission occurs (comment, approval, or changes requested)
- **Metric**: The time difference between these two events, excluding weekends

### 2. Time to Merge (Planned)
Measures the time from when a PR is marked as "Ready for Review" to when it is merged.

- **Start Time**: When a PR is marked as "Ready for Review"
- **End Time**: When the PR is merged into the target branch
- **Metric**: The time difference between these two events, excluding weekends

### 3. Time to QA Ready (Planned)
Measures the time from issue reaching "In Progress" status to when it reaches "Awaiting QA" status in GitHub Projects.

- **Start Time**: When an issue is moved to "In Progress"
- **End Time**: When the issue status changes to "Awaiting QA" or "Ready for release" in GitHub Projects
- **Metric**: The time difference between these two events, excluding weekends

### 4. Time to Production Ready (Planned)
Measures the time from issue reaching "In Progress" status to when it reaches "Ready for Release" status in GitHub Projects.

- **Start Time**: When an issue is moved to "In Progress"
- **End Time**: When the issue status changes to "Ready for Release" in GitHub Projects
- **Metric**: The time difference between these two events, excluding weekends

## Current Implementation Status

- ✅ **Time to First Review**: Fully implemented and active
- 🚧 **Time to Merge**: Planned for future implementation
- 🚧 **Time to QA Ready**: Planned for future implementation  
- 🚧 **Time to Production Ready**: Planned for future implementation

## Features

- Collects engineering metrics from GitHub repositories
- Uploads metrics to Google BigQuery for analysis
- Configurable via JSON file and environment variables
- Can run as a standalone application or as a GitHub Action
- Supports multiple repositories
- Only tracks PRs targeting the main branch
- Excludes weekends from time calculations
- Supports print-only mode for testing without BigQuery

## Prerequisites

- Node.js 20 or higher
- A GitHub token with `repo` scope
- A Google Cloud project with BigQuery enabled
- A Google Cloud service account with BigQuery permissions

## Installation

```bash
# Clone the repository
git clone https://github.com/getvictor/eng-metrics.git
cd pickup-time/.github/actions/eng-metrics

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
name: Collect engineering metrics

on:
  schedule:
    - cron: '0 0 * * *'  # Run daily at midnight UTC
  workflow_dispatch:      # Allow manual triggering

jobs:
  collect-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: .github/actions/eng-metrics/package-lock.json
          
      - name: Install dependencies
        run: npm ci
        working-directory: .github/actions/eng-metrics
      
      - name: Create service account key file
        run: |
          echo '${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}' > service-account-key.json
          # Verify the file is valid JSON
          cat service-account-key.json | jq . > /dev/null
      
      - name: Collect and upload metrics
        uses: ./.github/actions/eng-metrics
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
   - The workflow passes configuration values as environment variables
   - Environment variables are used directly by the application

Make sure to set the following secrets in your repository:

- `GITHUB_TOKEN`: GitHub token with repo scope (automatically provided by GitHub Actions)
- `GCP_SERVICE_ACCOUNT_KEY`: JSON service account key as a string
- `BIGQUERY_PROJECT_ID`: Google Cloud project ID

## BigQuery Schema

### Current Schema (Time to First Review)

The tool currently creates a BigQuery table with the following schema:

| Field | Type | Description |
|-------|------|-------------|
| review_date | DATE | Date when the reviewer started looking at the PR |
| pr_creator | STRING | GitHub username of the PR creator (cluster) |
| pr_url | STRING | HTTP link to the PR |
| pickup_time_seconds | INTEGER | Time in seconds from "Ready for Review" to first review (excluding weekends) |
| repository | STRING | Repository name (owner/repo) |
| pr_number | INTEGER | PR number |
| target_branch | STRING | Branch the PR is targeting (always "main") |
| ready_time | TIMESTAMP | Timestamp when PR was marked ready for review |
| first_review_time | TIMESTAMP | Timestamp of first review activity (partition) |

### Planned Schema Extensions

Future versions will extend the schema to include additional metrics:

| Field | Type | Description |
|-------|------|-------------|
| metric_type | STRING | Type of metric (time_to_first_review, time_to_merge, time_to_qa_ready, time_to_production_ready) |
| merge_time | TIMESTAMP | Timestamp when PR was merged (for time_to_merge) |
| issue_number | INTEGER | Issue number (for project-based metrics) |
| issue_created_time | TIMESTAMP | Timestamp when issue was created |
| qa_ready_time | TIMESTAMP | Timestamp when issue reached QA ready status |
| production_ready_time | TIMESTAMP | Timestamp when issue reached production ready status |
| time_to_merge_seconds | INTEGER | Time from ready to merge (excluding weekends) |
| time_to_qa_ready_seconds | INTEGER | Time from issue creation to QA ready (excluding weekends) |
| time_to_production_ready_seconds | INTEGER | Time from issue creation to production ready (excluding weekends) |

The table uses `pr_number` as the primary key for PR-based metrics and `issue_number` for issue-based metrics, which means:
- Each PR/issue is only stored once in the database per metric type
- If a record already exists in the database, it will not be updated or overwritten
- This ensures that the first calculation of each metric is preserved

## Print-Only Mode

The tool supports a print-only mode that prints metrics to the console instead of uploading them to BigQuery. This is useful for testing without setting up BigQuery.

To enable print-only mode:

1. Set `printOnly: true` in your config.json file, OR
2. Set the `PRINT_ONLY=true` environment variable, OR
3. Use the `--print-only` command line flag

When running in print-only mode, you don't need to provide BigQuery credentials or configuration.

## Development

### Running Tests

```bash
npm test
```

The project includes unit tests for the core functionality, including table-driven tests for the metrics calculation logic. These tests verify that:

- PRs created as non-draft are handled correctly
- PRs converted from draft to ready are handled correctly
- Multiple ready_for_review events are handled correctly (using the most recent one before review)
- Edge cases like no reviews or no ready events are handled properly
- PRs with multiple reviews are handled correctly (only the first review is counted)
- Weekend days are properly excluded from time calculations

### Linting

```bash
npm run lint
```

## Roadmap

### Phase 1: Current Implementation
- ✅ Time to First Review metric collection
- ✅ BigQuery integration
- ✅ GitHub Action workflow
- ✅ Print-only mode for testing

### Phase 2: Additional PR Metrics
- 🚧 Time to Merge metric
- 🚧 Extended BigQuery schema
- 🚧 Multi-metric support in queries

### Phase 3: GitHub Projects Integration
- 🚧 GitHub Projects API integration
- 🚧 Time to QA Ready metric
- 🚧 Time to Production Ready metric
- 🚧 Issue lifecycle tracking

### Phase 4: Enhanced Analytics
- 🚧 Dashboard templates
- 🚧 Automated reporting
- 🚧 Trend analysis and alerting

## Contributing

When contributing to this project, please:

1. Update tests for any new metrics or functionality
2. Update documentation to reflect changes
3. Follow the existing code style and patterns
4. Consider backward compatibility for BigQuery schema changes
