import { jest } from '@jest/globals';
import GitHubClient from '../src/github-client.js';

// Mock the logger to avoid console output during tests
jest.mock('../src/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('GitHubClient', () => {
  let githubClient;

  beforeEach(() => {
    // Create a new instance of GitHubClient for each test
    githubClient = new GitHubClient('fake-token');
    
    // Mock the Octokit instance
    githubClient.octokit = {
      rest: {
        pulls: {
          list: jest.fn(),
          listReviews: jest.fn(),
        },
        issues: {
          listEventsForTimeline: jest.fn(),
        }
      }
    };
  });

  describe('calculatePickupTime', () => {
    // Table-driven test cases for calculatePickupTime
    const testCases = [
      {
        name: 'PR created as non-draft with one review',
        pr: {
          number: 123,
          html_url: 'https://github.com/owner/repo/pull/123',
          draft: false,
          created_at: '2023-05-10T10:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [],
        reviewEvents: [
          { submitted_at: '2023-05-10T11:30:00Z' }
        ],
        expected: {
          repository: 'owner/repo',
          prNumber: 123,
          prUrl: 'https://github.com/owner/repo/pull/123',
          prCreator: 'author',
          targetBranch: 'main',
          readyTime: new Date('2023-05-10T10:00:00Z'),
          firstReviewTime: new Date('2023-05-10T11:30:00Z'),
          reviewDate: '2023-05-10',
          pickupTimeSeconds: 5400, // 1.5 hours = 5400 seconds
          readyEventType: 'PR creation (not draft)'
        }
      },
      {
        name: 'PR created as draft, then marked as ready for review, then reviewed',
        pr: {
          number: 124,
          html_url: 'https://github.com/owner/repo/pull/124',
          draft: true,
          created_at: '2023-05-11T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [
          { 
            event: 'ready_for_review',
            created_at: '2023-05-11T10:00:00Z'
          }
        ],
        reviewEvents: [
          { submitted_at: '2023-05-11T11:00:00Z' }
        ],
        expected: {
          repository: 'owner/repo',
          prNumber: 124,
          prUrl: 'https://github.com/owner/repo/pull/124',
          prCreator: 'author',
          targetBranch: 'main',
          readyTime: new Date('2023-05-11T10:00:00Z'),
          firstReviewTime: new Date('2023-05-11T11:00:00Z'),
          reviewDate: '2023-05-11',
          pickupTimeSeconds: 3600, // 1 hour = 3600 seconds
          readyEventType: 'ready_for_review event'
        }
      },
      {
        name: 'PR with multiple ready_for_review events and one review',
        pr: {
          number: 125,
          html_url: 'https://github.com/owner/repo/pull/125',
          draft: true,
          created_at: '2023-05-12T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [
          { 
            event: 'ready_for_review',
            created_at: '2023-05-12T10:00:00Z'
          },
          { 
            event: 'convert_to_draft',
            created_at: '2023-05-12T11:00:00Z'
          },
          { 
            event: 'ready_for_review',
            created_at: '2023-05-12T12:00:00Z'
          }
        ],
        reviewEvents: [
          { submitted_at: '2023-05-12T13:00:00Z' }
        ],
        expected: {
          repository: 'owner/repo',
          prNumber: 125,
          prUrl: 'https://github.com/owner/repo/pull/125',
          prCreator: 'author',
          targetBranch: 'main',
          readyTime: new Date('2023-05-12T12:00:00Z'),
          firstReviewTime: new Date('2023-05-12T13:00:00Z'),
          reviewDate: '2023-05-12',
          pickupTimeSeconds: 3600, // 1 hour = 3600 seconds
          readyEventType: 'ready_for_review event'
        }
      },
      {
        name: 'PR with ready_for_review event after the first review',
        pr: {
          number: 126,
          html_url: 'https://github.com/owner/repo/pull/126',
          draft: false,
          created_at: '2023-05-13T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [
          { 
            event: 'convert_to_draft',
            created_at: '2023-05-13T10:00:00Z'
          },
          { 
            event: 'ready_for_review',
            created_at: '2023-05-13T12:00:00Z'
          }
        ],
        reviewEvents: [
          { submitted_at: '2023-05-13T11:00:00Z' }
        ],
        expected: {
          repository: 'owner/repo',
          prNumber: 126,
          prUrl: 'https://github.com/owner/repo/pull/126',
          prCreator: 'author',
          targetBranch: 'main',
          readyTime: new Date('2023-05-13T09:00:00Z'),
          firstReviewTime: new Date('2023-05-13T11:00:00Z'),
          reviewDate: '2023-05-13',
          pickupTimeSeconds: 7200, // 2 hours = 7200 seconds
          readyEventType: 'PR creation (not draft)'
        }
      },
      {
        name: 'PR with no ready_for_review events and created as draft',
        pr: {
          number: 127,
          html_url: 'https://github.com/owner/repo/pull/127',
          draft: true,
          created_at: '2023-05-14T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [],
        reviewEvents: [
          { submitted_at: '2023-05-14T11:00:00Z' }
        ],
        expected: null // Should return null because no ready event was found
      },
      {
        name: 'PR with no reviews',
        pr: {
          number: 128,
          html_url: 'https://github.com/owner/repo/pull/128',
          draft: false,
          created_at: '2023-05-15T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [],
        reviewEvents: [],
        expected: null // Should return null because no reviews were found
      },
      {
        name: 'PR with multiple reviews - only first one should be counted',
        pr: {
          number: 129,
          html_url: 'https://github.com/owner/repo/pull/129',
          draft: false,
          created_at: '2023-05-16T09:00:00Z',
          user: { login: 'author' },
          base: {
            ref: 'main',
            repo: {
              name: 'repo',
              owner: { login: 'owner' }
            }
          }
        },
        timelineEvents: [],
        reviewEvents: [
          { submitted_at: '2023-05-16T10:00:00Z' }, // First review - should be used
          { submitted_at: '2023-05-16T11:00:00Z' }, // Second review - should be ignored
          { submitted_at: '2023-05-16T12:00:00Z' }  // Third review - should be ignored
        ],
        expected: {
          repository: 'owner/repo',
          prNumber: 129,
          prUrl: 'https://github.com/owner/repo/pull/129',
          prCreator: 'author',
          targetBranch: 'main',
          readyTime: new Date('2023-05-16T09:00:00Z'),
          firstReviewTime: new Date('2023-05-16T10:00:00Z'),
          reviewDate: '2023-05-16',
          pickupTimeSeconds: 3600, // 1 hour = 3600 seconds
          readyEventType: 'PR creation (not draft)'
        }
      }
    ];

    // Run each test case
    test.each(testCases)('$name', ({ pr, timelineEvents, reviewEvents, expected }) => {
      const result = githubClient.calculatePickupTime(pr, timelineEvents, reviewEvents);
      
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        // Compare date objects separately
        expect(result.readyTime).toEqual(expected.readyTime);
        expect(result.firstReviewTime).toEqual(expected.firstReviewTime);
        
        // Compare the rest of the properties
        expect({
          ...result,
          readyTime: undefined,
          firstReviewTime: undefined
        }).toEqual({
          ...expected,
          readyTime: undefined,
          firstReviewTime: undefined
        });
      }
    });
  });
});