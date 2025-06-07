import { SharesService } from '../../src/services/shares.service';
import { BookmarkAIClient } from '../../src/client';

// Mock the client
jest.mock('../../src/client');

describe('SharesService', () => {
  let service: SharesService;
  let mockClient: jest.Mocked<BookmarkAIClient>;

  beforeEach(() => {
    mockClient = {
      request: jest.fn(),
    } as any;

    service = new SharesService(mockClient as any, {
      enableBatching: false, // Disable for most tests
    });
  });

  describe('create', () => {
    it('should create a share with generated idempotency key', async () => {
      const mockShare = {
        id: '123',
        url: 'https://tiktok.com/video',
        status: 'pending',
        platform: 'tiktok',
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockClient.request.mockResolvedValue({
        data: mockShare,
        status: 202,
        statusText: 'Accepted',
        headers: {},
      });

      const result = await service.create({
        url: 'https://tiktok.com/video',
      });

      expect(mockClient.request).toHaveBeenCalledWith({
        url: '/shares',
        method: 'POST',
        headers: {
          'Idempotency-Key': expect.stringMatching(/^share_\d+_\d+_[a-z0-9]+$/),
        },
        data: {
          url: 'https://tiktok.com/video',
        },
      });

      expect(result).toEqual(mockShare);
    });

    it('should use provided idempotency key', async () => {
      const mockShare = { id: '123', url: 'https://example.com' };
      mockClient.request.mockResolvedValue({ data: mockShare });

      await service.create(
        { url: 'https://example.com' },
        'custom-key-123'
      );

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Idempotency-Key': 'custom-key-123',
          },
        })
      );
    });
  });

  describe('list', () => {
    it('should list shares with pagination', async () => {
      const mockResponse = {
        items: [
          { id: '1', url: 'https://example1.com' },
          { id: '2', url: 'https://example2.com' },
        ],
        cursor: 'next-cursor',
        hasMore: true,
      };

      mockClient.request.mockResolvedValue({ data: mockResponse });

      const result = await service.list({
        limit: 20,
        status: 'done',
        platform: 'reddit',
      });

      expect(mockClient.request).toHaveBeenCalledWith({
        url: '/shares',
        method: 'GET',
        params: {
          limit: 20,
          status: 'done',
          platform: 'reddit',
        },
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('listAll', () => {
    it('should iterate through all pages', async () => {
      // First page
      mockClient.request.mockResolvedValueOnce({
        data: {
          items: [
            { id: '1', url: 'https://example1.com' },
            { id: '2', url: 'https://example2.com' },
          ],
          cursor: 'page-2',
          hasMore: true,
        },
      });

      // Second page
      mockClient.request.mockResolvedValueOnce({
        data: {
          items: [
            { id: '3', url: 'https://example3.com' },
          ],
          hasMore: false,
        },
      });

      const shares = [];
      for await (const share of service.listAll()) {
        shares.push(share);
      }

      expect(shares).toHaveLength(3);
      expect(shares[0].id).toBe('1');
      expect(shares[2].id).toBe('3');
      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForProcessing', () => {
    it('should poll until share is processed', async () => {
      // First call - pending
      mockClient.request.mockResolvedValueOnce({
        data: { id: '123', status: 'pending' },
      });

      // Second call - processing
      mockClient.request.mockResolvedValueOnce({
        data: { id: '123', status: 'processing' },
      });

      // Third call - done
      mockClient.request.mockResolvedValueOnce({
        data: { id: '123', status: 'done' },
      });

      const result = await service.waitForProcessing('123', {
        pollInterval: 10, // Fast polling for tests
      });

      expect(result.status).toBe('done');
      expect(mockClient.request).toHaveBeenCalledTimes(3);
    });

    it('should timeout if processing takes too long', async () => {
      mockClient.request.mockResolvedValue({
        data: { id: '123', status: 'processing' },
      });

      await expect(
        service.waitForProcessing('123', {
          timeout: 100,
          pollInterval: 50,
        })
      ).rejects.toThrow('Timeout waiting for share 123 to process');
    });
  });

  describe('batching', () => {
    it('should batch multiple creates within window', async () => {
      const batchService = new SharesService(mockClient as any, {
        enableBatching: true,
        batchWindow: 100,
        maxBatchSize: 3,
      });

      mockClient.request.mockResolvedValue({
        data: {
          accepted: [
            { id: '1', url: 'https://example1.com' },
            { id: '2', url: 'https://example2.com' },
          ],
          rejected: [],
        },
      });

      // Create two shares quickly
      const promise1 = batchService.create({ url: 'https://example1.com' });
      const promise2 = batchService.create({ url: 'https://example2.com' });

      const [share1, share2] = await Promise.all([promise1, promise2]);

      expect(share1.id).toBe('1');
      expect(share2.id).toBe('2');

      // Should have made only one batch request
      expect(mockClient.request).toHaveBeenCalledTimes(1);
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/shares/batch',
          method: 'POST',
        })
      );

      batchService.destroy();
    });
  });
});