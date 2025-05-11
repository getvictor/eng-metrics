/**
 * GitHub client module for PR pickup time metrics collector
 * Handles interactions with the GitHub API using Octokit.js
 */

import { Octokit } from 'octokit';
import logger from './logger.js';

/**
 * GitHub client class
 */
export class GitHubClient {
  /**
   * Creates a new GitHub client
   * @param {string} token - GitHub API token
   */
  constructor(token) {
    this.octokit = null;
    this.initialize(token);
  }

  /**
   * Initializes the GitHub client
   * @param {string} token - GitHub API token
   */
  initialize(token) {
    try {
      this.octokit = new Octokit({
        auth: token
      });
      logger.info('GitHub client initialized');
    } catch (err) {
      logger.error('Failed to initialize GitHub client', err);
      throw err;
    }
  }

  /**
   * Fetches pull requests for a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} state - PR state (open, closed, all)
   * @param {Date} since - Fetch PRs updated since this date
   * @param {string} targetBranch - Target branch to filter PRs by
   * @returns {Array} Array of pull requests
   */
  async fetchPullRequests(owner, repo, state = 'all', since, targetBranch = 'main') {
    try {
      logger.info(`Fetching ${state} PRs for ${owner}/${repo} since ${since.toISOString()}`);
      
      // GitHub API returns paginated results, so we need to fetch all pages
      const pullRequests = [];
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const response = await this.octokit.rest.pulls.list({
          owner,
          repo,
          state,
          sort: 'updated',
          direction: 'desc',
          per_page: 100,
          page
        });
        
        // Filter PRs by update date and target branch
        const filteredPRs = response.data.filter(pr => {
          const prUpdatedAt = new Date(pr.updated_at);
          return prUpdatedAt >= since && pr.base.ref === targetBranch;
        });
        
        if (filteredPRs.length > 0) {
          pullRequests.push(...filteredPRs);
          page++;
        } else {
          hasMorePages = false;
        }
        
        // If we got fewer results than the page size, there are no more pages
        if (response.data.length < 100) {
          hasMorePages = false;
        }
      }
      
      logger.info(`Fetched ${pullRequests.length} PRs for ${owner}/${repo}`);
      return pullRequests;
    } catch (err) {
      logger.error(`Error fetching PRs for ${owner}/${repo}`, err);
      
      // Implement basic retry for rate limiting
      if (err.status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(err.response.headers['x-ratelimit-reset'], 10) * 1000;
        const waitTime = resetTime - Date.now();
        
        if (waitTime > 0 && waitTime < 3600000) { // Only retry if wait time is less than 1 hour
          logger.info(`Rate limit exceeded. Retrying in ${Math.ceil(waitTime / 1000)} seconds`);
          await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
          return this.fetchPullRequests(owner, repo, state, since, targetBranch);
        }
      }
      
      throw err;
    }
  }

  /**
   * Fetches PR review events
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @returns {Array} Array of review events
   */
  async fetchPRReviewEvents(owner, repo, prNumber) {
    try {
      logger.info(`Fetching review events for ${owner}/${repo}#${prNumber}`);
      
      const response = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
      });
      
      logger.info(`Fetched ${response.data.length} review events for ${owner}/${repo}#${prNumber}`);
      return response.data;
    } catch (err) {
      logger.error(`Error fetching review events for ${owner}/${repo}#${prNumber}`, err);
      
      // Implement basic retry for rate limiting
      if (err.status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(err.response.headers['x-ratelimit-reset'], 10) * 1000;
        const waitTime = resetTime - Date.now();
        
        if (waitTime > 0 && waitTime < 3600000) { // Only retry if wait time is less than 1 hour
          logger.info(`Rate limit exceeded. Retrying in ${Math.ceil(waitTime / 1000)} seconds`);
          await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
          return this.fetchPRReviewEvents(owner, repo, prNumber);
        }
      }
      
      throw err;
    }
  }

  /**
   * Fetches PR timeline events
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @returns {Array} Array of timeline events
   */
  async fetchPRTimelineEvents(owner, repo, prNumber) {
    try {
      logger.info(`Fetching timeline events for ${owner}/${repo}#${prNumber}`);
      
      // GitHub API returns paginated results, so we need to fetch all pages
      const timelineEvents = [];
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const response = await this.octokit.rest.issues.listEventsForTimeline({
          owner,
          repo,
          issue_number: prNumber,
          per_page: 100,
          page
        });
        
        if (response.data.length > 0) {
          timelineEvents.push(...response.data);
          page++;
        } else {
          hasMorePages = false;
        }
        
        // If we got fewer results than the page size, there are no more pages
        if (response.data.length < 100) {
          hasMorePages = false;
        }
      }
      
      logger.info(`Fetched ${timelineEvents.length} timeline events for ${owner}/${repo}#${prNumber}`);
      return timelineEvents;
    } catch (err) {
      logger.error(`Error fetching timeline events for ${owner}/${repo}#${prNumber}`, err);
      
      // Implement basic retry for rate limiting
      if (err.status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(err.response.headers['x-ratelimit-reset'], 10) * 1000;
        const waitTime = resetTime - Date.now();
        
        if (waitTime > 0 && waitTime < 3600000) { // Only retry if wait time is less than 1 hour
          logger.info(`Rate limit exceeded. Retrying in ${Math.ceil(waitTime / 1000)} seconds`);
          await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
          return this.fetchPRTimelineEvents(owner, repo, prNumber);
        }
      }
      
      throw err;
    }
  }

  /**
   * Calculates pickup time for a PR
   * @param {Object} pr - Pull request object
   * @param {Array} timelineEvents - PR timeline events
   * @param {Array} reviewEvents - PR review events
   * @returns {Object} Pickup time metrics
   */
  calculatePickupTime(pr, timelineEvents, reviewEvents) {
    try {
      // Find all ready_for_review events
      const readyForReviewEvents = timelineEvents.filter(event =>
        event.event === 'ready_for_review'
      ).map(event => ({
        time: new Date(event.created_at),
        event
      }));
      
      // Add PR creation time as a ready event if PR was not created as draft
      if (!pr.draft) {
        readyForReviewEvents.push({
          time: new Date(pr.created_at),
          event: { event: 'created_not_draft', created_at: pr.created_at }
        });
      }
      
      // Sort ready events by time (ascending)
      readyForReviewEvents.sort((a, b) => a.time - b.time);
      
      // If we couldn't find any ready events, return null
      if (readyForReviewEvents.length === 0) {
        logger.warn(`No ready_for_review events found for ${pr.html_url}`);
        return null;
      }
      
      // Find the first review submission
      if (reviewEvents.length === 0) {
        logger.warn(`No review events found for ${pr.html_url}`);
        return null;
      }
      
      // Sort review events by submitted_at (ascending)
      const sortedReviewEvents = [...reviewEvents].sort((a, b) =>
        new Date(a.submitted_at) - new Date(b.submitted_at)
      );
      
      const firstReview = sortedReviewEvents[0];
      const firstReviewTime = new Date(firstReview.submitted_at);
      
      // Find the most recent ready event that occurred before the first review
      const relevantReadyEvent = readyForReviewEvents
        .filter(readyEvent => readyEvent.time < firstReviewTime)
        .pop();
      
      // If no ready event occurred before the first review, return null
      if (!relevantReadyEvent) {
        logger.warn(`No ready_for_review event found before first review for ${pr.html_url}`);
        return null;
      }
      
      const readyTime = relevantReadyEvent.time;
      
      // Calculate pickup time in seconds
      const pickupTimeSeconds = Math.floor((firstReviewTime - readyTime) / 1000);
      
      // If pickup time is negative, something went wrong
      if (pickupTimeSeconds < 0) {
        logger.warn(`Negative pickup time for ${pr.html_url}`, {
          readyTime,
          firstReviewTime,
          pickupTimeSeconds
        });
        return null;
      }
      
      // Log which ready event was used
      const readyEventType = relevantReadyEvent.event.event === 'created_not_draft'
        ? 'PR creation (not draft)'
        : 'ready_for_review event';
      
      logger.info(`Calculated pickup time for ${pr.html_url}`, {
        pickupTimeSeconds,
        readyEventType,
        readyTime: readyTime.toISOString(),
        firstReviewTime: firstReviewTime.toISOString()
      });
      
      // We already have readyEventType defined above, so we can use it here
      
      return {
        repository: `${pr.base.repo.owner.login}/${pr.base.repo.name}`,
        prNumber: pr.number,
        prUrl: pr.html_url,
        prCreator: pr.user.login,
        targetBranch: pr.base.ref,
        readyTime,
        firstReviewTime,
        reviewDate: firstReviewTime.toISOString().split('T')[0], // YYYY-MM-DD
        pickupTimeSeconds,
        readyEventType
      };
    } catch (err) {
      logger.error(`Error calculating pickup time for ${pr.html_url}`, err);
      return null;
    }
  }
}

export default GitHubClient;