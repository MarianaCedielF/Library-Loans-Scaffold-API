import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
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
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    description: null,
    totalCopies: 3,
    availableCopies: 3,
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
      const dto = { title: 'Clean Code', author: 'R. Martin', totalCopies: 3 };
      const item = makeItem();

      itemRepo.findOne!.mockResolvedValue(null);
      itemRepo.create!.mockReturnValue(item);
      itemRepo.save!.mockResolvedValue(item);

      const result = await service.create(dto);
      expect(result).toEqual(item);
      expect(itemRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if ISBN already exists', async () => {
      itemRepo.findOne!.mockResolvedValue(makeItem());

      await expect(
        service.create({ title: 'Book', author: 'Author', isbn: '978-0132350884', totalCopies: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return an array of items', async () => {
      itemRepo.find!.mockResolvedValue([makeItem()]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return item when found', async () => {
      const item = makeItem();
      itemRepo.findOne!.mockResolvedValue(item);
      const result = await service.findOne('item-uuid');
      expect(result).toEqual(item);
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

    it('should throw BadRequestException if reducing copies below borrowed count', async () => {
      const item = makeItem({ totalCopies: 3, availableCopies: 1 });
      itemRepo.findOne!.mockResolvedValue(item);

      await expect(service.update('item-uuid', { totalCopies: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should remove the item', async () => {
      const item = makeItem();
      itemRepo.findOne!.mockResolvedValue(item);
      itemRepo.remove!.mockResolvedValue(item);

      await service.remove('item-uuid');
      expect(itemRepo.remove).toHaveBeenCalledWith(item);
    });

    it('should throw NotFoundException when item does not exist', async () => {
      itemRepo.findOne!.mockResolvedValue(null);
      await expect(service.remove('no-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
