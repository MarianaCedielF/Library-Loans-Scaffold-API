import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const existing = await this.itemRepository.findOne({ where: { code: dto.code } });
    if (existing) throw new BadRequestException(`Ya existe un ítem con el código ${dto.code}`);

    const item = this.itemRepository.create(dto);
    return this.itemRepository.save(item);
  }

  findAll(): Promise<Item[]> {
    return this.itemRepository.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem con id ${id} no encontrado`);
    return item;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findOne(id);

    if (dto.code && dto.code !== item.code) {
      const existing = await this.itemRepository.findOne({ where: { code: dto.code } });
      if (existing) throw new BadRequestException(`Ya existe un ítem con el código ${dto.code}`);
    }

    Object.assign(item, dto);
    return this.itemRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    item.isActive = false;
    await this.itemRepository.save(item);
  }
}
