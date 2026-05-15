import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Item, ItemType } from './entities/item.entity';
import { ItemsService } from './items.service';

type MockRepository<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockItemRepository = (): MockRepository<Item> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
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

describe('ItemsService', () => {
  let service: ItemsService;
  let itemRepo: MockRepository<Item>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useFactory: mockItemRepository },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    itemRepo = module.get(getRepositoryToken(Item));
  });

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
    it('should return active items', async () => {
      itemRepo.find!.mockResolvedValue([makeItem()]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return item when found', async () => {
      itemRepo.findOne!.mockResolvedValue(makeItem());
      const result = await service.findOne('item-uuid');
      expect(result.code).toBe('BK-0042');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.findOne('no-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return the item', async () => {
      const item = makeItem();
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue({ ...item, title: 'Updated' });

      const result = await service.update('item-uuid', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.update('no-uuid', { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if new code already taken', async () => {
      const item = makeItem();
      const other = makeItem({ id: 'other-id', code: 'BK-0099' });
      itemRepo.findOne!
        .mockResolvedValueOnce(item)
        .mockResolvedValueOnce(other);

      await expect(service.update('item-uuid', { code: 'BK-0099' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should soft-delete the item (isActive = false)', async () => {
      const item = makeItem();
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.save!.mockResolvedValue({ ...item, isActive: false });

      await service.remove('item-uuid');
      expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.remove('no-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
