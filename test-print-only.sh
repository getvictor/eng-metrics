#!/bin/bash

# This script runs the PR pickup time metrics collector in print-only mode
# It's useful for testing without uploading to BigQuery

# Make the script executable if it's not already
chmod +x src/index.js

# Run the tool with the print-only flag
node src/index.js --print-only