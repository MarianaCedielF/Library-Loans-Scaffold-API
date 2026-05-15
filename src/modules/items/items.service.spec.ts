import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { Item, ItemType } from './entities/item.entity';
import { ItemsService } from './items.service';

type MockRepository<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockItemRepository = (): MockRepository<Item> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const makeItem = (overrides: Partial<Item> = {}): Item =>
  ({
    id: 'item-uuid',
    code: 'BK-0042',
    title: 'Clean Code',
    type: ItemType.BOOK,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Item;

const mockDataSource = (activeLoanCount = 0) => ({
  getRepository: jest.fn().mockReturnValue({
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(activeLoanCount),
    }),
  }),
});

describe('ItemsService', () => {
  let service: ItemsService;
  let itemRepo: MockRepository<Item>;

  const buildModule = async (loanCount = 0): Promise<void> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useFactory: mockItemRepository },
        { provide: DataSource, useValue: mockDataSource(loanCount) },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    itemRepo = module.get(getRepositoryToken(Item));
  };

  beforeEach(() => buildModule(0));

  describe('create', () => {
    it('should create and return a new item', async () => {
      const dto = { code: 'BK-0042', title: 'Clean Code', type: ItemType.BOOK };
      const item = makeItem();

      itemRepo.findOne!.mockResolvedValue(null);
      itemRepo.create!.mockReturnValue(item);
      itemRepo.save!.mockResolvedValue(item);

      const result = await service.create(dto);
      expect(result).toEqual(item);
    });

    it('should throw BadRequestException if code already exists', async () => {
      itemRepo.findOne!.mockResolvedValue(makeItem());

      await expect(
        service.create({ code: 'BK-0042', title: 'Other', type: ItemType.BOOK }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return items with isAvailable computed', async () => {
      itemRepo.find!.mockResolvedValue([makeItem()]);
      const result = await service.findAll({});
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('isAvailable', true);
    });

    it('should mark isAvailable false when active loan exists', async () => {
      await buildModule(1);
      itemRepo.find!.mockResolvedValue([makeItem()]);
      const result = await service.findAll({});
      expect(result[0].isAvailable).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return item with isAvailable', async () => {
      itemRepo.findOne!.mockResolvedValue(makeItem());
      const result = await service.findOne('item-uuid');
      expect(result).toHaveProperty('isAvailable', true);
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.findOne('no-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return the item with isAvailable', async () => {
      const item = makeItem();
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue({ ...item, title: 'Updated' });

      const result = await service.update('item-uuid', { title: 'Updated' });
      expect(result.title).toBe('Updated');
      expect(result).toHaveProperty('isAvailable');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.update('no-uuid', { title: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete the item (isActive = false)', async () => {
      itemRepo.findOne!.mockResolvedValue(makeItem());
      itemRepo.save!.mockResolvedValue(makeItem({ isActive: false }));

      await service.remove('item-uuid');
      expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.remove('no-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
