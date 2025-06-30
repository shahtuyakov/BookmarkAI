import { Test, TestingModule } from '@nestjs/testing';
import { SharesRepository } from './shares.repository';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { ShareStatus } from '../constants/share-status.enum';
import { Platform } from '../constants/platform.enum';

describe('SharesRepository', () => {
  let repository: SharesRepository;
  let drizzleService: DrizzleService;

  const mockDrizzleService = {
    database: {
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({ rows: [] }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharesRepository,
        {
          provide: DrizzleService,
          useValue: mockDrizzleService,
        },
      ],
    }).compile();

    repository = module.get<SharesRepository>(SharesRepository);
    drizzleService = module.get<DrizzleService>(DrizzleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new share', async () => {
      const mockShare = {
        id: '123',
        userId: 'user123',
        url: 'https://example.com',
        platform: Platform.TWITTER,
        status: ShareStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDrizzleService.database.returning.mockResolvedValueOnce([mockShare]);

      const result = await repository.create({
        userId: 'user123',
        url: 'https://example.com',
        platform: Platform.TWITTER,
      });

      expect(result).toEqual(mockShare);
      expect(mockDrizzleService.database.insert).toHaveBeenCalled();
      expect(mockDrizzleService.database.returning).toHaveBeenCalled();
    });
  });

  describe('updateWorkflowState', () => {
    it('should update workflow state', async () => {
      const mockUpdatedShare = {
        id: '123',
        workflowState: 'transcribing',
        updatedAt: new Date(),
      };

      mockDrizzleService.database.returning.mockResolvedValueOnce([mockUpdatedShare]);

      const result = await repository.updateWorkflowState('123', 'transcribing');

      expect(result).toEqual(mockUpdatedShare);
      expect(mockDrizzleService.database.update).toHaveBeenCalled();
      expect(mockDrizzleService.database.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowState: 'transcribing',
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe('startEnhancement', () => {
    it('should start enhancement workflow', async () => {
      const mockShare = {
        id: '123',
        workflowState: 'transcribing',
        enhancementStartedAt: new Date(),
        enhancementCompletedAt: null,
      };

      mockDrizzleService.database.returning.mockResolvedValueOnce([mockShare]);

      const result = await repository.startEnhancement('123', 'transcribing');

      expect(result).toEqual(mockShare);
      expect(mockDrizzleService.database.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowState: 'transcribing',
          enhancementStartedAt: expect.any(Date),
          enhancementCompletedAt: null,
        })
      );
    });
  });

  describe('completeEnhancement', () => {
    it('should complete enhancement workflow and increment version', async () => {
      // Mock the select query for getting current version
      mockDrizzleService.database.limit.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce([{ enhancementVersion: 2 }]),
      });

      const mockCompletedShare = {
        id: '123',
        workflowState: 'completed',
        enhancementCompletedAt: new Date(),
        enhancementVersion: 3,
      };

      mockDrizzleService.database.returning.mockResolvedValueOnce([mockCompletedShare]);

      const result = await repository.completeEnhancement('123', 'completed');

      expect(result).toEqual(mockCompletedShare);
      expect(mockDrizzleService.database.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowState: 'completed',
          enhancementCompletedAt: expect.any(Date),
          enhancementVersion: 3,
        })
      );
    });
  });

  describe('findByWorkflowState', () => {
    it('should find shares by workflow state', async () => {
      const mockShares = [
        { id: '1', workflowState: 'transcribing' },
        { id: '2', workflowState: 'transcribing' },
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockShares),
      };

      mockDrizzleService.database.select.mockReturnValueOnce(mockQuery);

      const result = await repository.findByWorkflowState('transcribing', 10);

      expect(result).toEqual(mockShares);
      expect(mockQuery.where).toHaveBeenCalled();
      expect(mockQuery.orderBy).toHaveBeenCalled();
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('getWorkflowStateStats', () => {
    it('should get workflow state statistics', async () => {
      const mockStats = [
        {
          workflow_state: 'transcribing',
          count: '5',
          oldest_started: new Date('2024-01-01'),
          latest_completed: null,
        },
        {
          workflow_state: 'completed',
          count: '10',
          oldest_started: new Date('2024-01-01'),
          latest_completed: new Date('2024-01-02'),
        },
      ];

      mockDrizzleService.database.execute.mockResolvedValueOnce({ rows: mockStats });

      const result = await repository.getWorkflowStateStats();

      expect(result).toEqual([
        {
          workflowState: 'transcribing',
          count: 5,
          oldestStarted: new Date('2024-01-01'),
          latestCompleted: null,
        },
        {
          workflowState: 'completed',
          count: 10,
          oldestStarted: new Date('2024-01-01'),
          latestCompleted: new Date('2024-01-02'),
        },
      ]);
    });
  });
});