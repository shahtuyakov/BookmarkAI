import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../../../../../config/services/config.service';
import { TikTokFetcher } from '../tiktok.fetcher';
import { Platform } from '../../../constants/platform.enum';
import { FetcherErrorCode } from '../../interfaces/fetcher-error.interface';
import * as nock from 'nock';

describe('TikTokFetcher', () => {
  let fetcher: TikTokFetcher;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokFetcher,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                FETCHER_USER_AGENT: 'BookmarkAI Test/1.0',
                FETCHER_TIKTOK_TIMEOUT: 5000,
                ENABLED_PLATFORMS: 'tiktok,reddit,generic',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    fetcher = module.get<TikTokFetcher>(TikTokFetcher);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('canHandle', () => {
    it('should handle TikTok URLs', () => {
      expect(fetcher.canHandle('https://www.tiktok.com/@user/video/123')).toBe(true);
      expect(fetcher.canHandle('https://tiktok.com/@user/video/123')).toBe(true);
      expect(fetcher.canHandle('https://vm.tiktok.com/abc123')).toBe(true);
      expect(fetcher.canHandle('https://m.tiktok.com/@user/video/123')).toBe(true);
    });

    it('should not handle non-TikTok URLs', () => {
      expect(fetcher.canHandle('https://www.youtube.com/watch?v=123')).toBe(false);
      expect(fetcher.canHandle('https://reddit.com/r/test')).toBe(false);
      expect(fetcher.canHandle('invalid-url')).toBe(false);
    });
  });

  describe('fetchContent', () => {
    const mockRequest = {
      url: 'https://www.tiktok.com/@user/video/123456789',
      shareId: 'share-123',
      userId: 'user-123',
    };

    it('should fetch TikTok content successfully', async () => {
      const mockOembedResponse = {
        title: 'Amazing TikTok Video',
        author_name: 'testuser',
        thumbnail_url: 'https://example.com/thumb.jpg',
        html: '<iframe src="https://www.tiktok.com/embed/v2/123456789"></iframe>',
      };

      nock('https://www.tiktok.com')
        .get('/oembed')
        .query({ url: mockRequest.url })
        .reply(200, mockOembedResponse);

      const result = await fetcher.fetchContent(mockRequest);

      expect(result).toMatchObject({
        content: {
          text: 'Amazing TikTok Video',
          description: 'Video by @testuser',
        },
        media: {
          type: 'video',
          thumbnailUrl: 'https://example.com/thumb.jpg',
        },
        metadata: {
          author: 'testuser',
          platform: Platform.TIKTOK,
          platformId: '123456789',
        },
        hints: {
          hasNativeCaptions: true,
          requiresAuth: false,
        },
      });
    });

    it('should handle private video error', async () => {
      nock('https://www.tiktok.com')
        .get('/oembed')
        .query({ url: mockRequest.url })
        .reply(400, { status_msg: 'This video is private' });

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow();
      await expect(fetcher.fetchContent(mockRequest)).rejects.toMatchObject({
        code: FetcherErrorCode.CONTENT_PRIVATE,
        platform: Platform.TIKTOK,
      });
    });

    it('should handle rate limiting', async () => {
      nock('https://www.tiktok.com')
        .get('/oembed')
        .query({ url: mockRequest.url })
        .reply(429);

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow();
      await expect(fetcher.fetchContent(mockRequest)).rejects.toMatchObject({
        code: FetcherErrorCode.RATE_LIMIT_EXCEEDED,
        platform: Platform.TIKTOK,
      });
    });

    it('should handle not found error', async () => {
      nock('https://www.tiktok.com')
        .get('/oembed')
        .query({ url: mockRequest.url })
        .reply(404);

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow();
      await expect(fetcher.fetchContent(mockRequest)).rejects.toMatchObject({
        code: FetcherErrorCode.CONTENT_NOT_FOUND,
        platform: Platform.TIKTOK,
      });
    });

    it('should handle invalid URL', async () => {
      const invalidRequest = {
        ...mockRequest,
        url: 'not-a-valid-url',
      };

      await expect(fetcher.fetchContent(invalidRequest)).rejects.toThrow();
      await expect(fetcher.fetchContent(invalidRequest)).rejects.toMatchObject({
        code: FetcherErrorCode.INVALID_URL,
        platform: Platform.TIKTOK,
      });
    });

    it('should handle timeout', async () => {
      nock('https://www.tiktok.com')
        .get('/oembed')
        .query({ url: mockRequest.url })
        .delayConnection(6000) // Delay longer than timeout
        .reply(200, {});

      await expect(fetcher.fetchContent({
        ...mockRequest,
        options: { timeout: 100 }, // Very short timeout
      })).rejects.toThrow();
    });
  });

  describe('getPlatform', () => {
    it('should return TIKTOK platform', () => {
      expect(fetcher.getPlatform()).toBe(Platform.TIKTOK);
    });
  });
});