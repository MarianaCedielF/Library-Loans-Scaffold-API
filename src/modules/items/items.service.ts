import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { LoanStatus } from '../loans/entities/loan.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';

export type ItemWithAvailability = Item & { isAvailable: boolean };

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const existing = await this.itemRepository.findOne({ where: { code: dto.code } });
    if (existing) throw new BadRequestException(`Ya existe un ítem con el código ${dto.code}`);

    const item = this.itemRepository.create(dto);
    return this.itemRepository.save(item);
  }

  async findAll(query: QueryItemsDto): Promise<ItemWithAvailability[]> {
    const where: FindOptionsWhere<Item> = { isActive: true };
    if (query.type) where.type = query.type;

    const items = await this.itemRepository.find({ where, order: { createdAt: 'DESC' } });
    return Promise.all(items.map((item) => this.withAvailability(item)));
  }

  async findOne(id: string): Promise<ItemWithAvailability> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem con id ${id} no encontrado`);
    return this.withAvailability(item);
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemWithAvailability> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem con id ${id} no encontrado`);

    if (dto.code && dto.code !== item.code) {
      const existing = await this.itemRepository.findOne({ where: { code: dto.code } });
      if (existing) throw new BadRequestException(`Ya existe un ítem con el código ${dto.code}`);
    }

    Object.assign(item, dto);
    const saved = await this.itemRepository.save(item);
    return this.withAvailability(saved);
  }

  async remove(id: string): Promise<void> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem con id ${id} no encontrado`);
    item.isActive = false;
    await this.itemRepository.save(item);
  }

  private async withAvailability(item: Item): Promise<ItemWithAvailability> {
    const loanRepo = this.dataSource.getRepository('loans');
    const count: number = await loanRepo
      .createQueryBuilder('loan')
      .where('loan.item_id = :itemId AND loan.status = :status', {
        itemId: item.id,
        status: LoanStatus.ACTIVE,
      })
      .getCount();
    return { ...item, isAvailable: count === 0 };
  }
}
