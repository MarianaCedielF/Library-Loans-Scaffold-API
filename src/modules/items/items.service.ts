import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    if (dto.isbn) {
      const existing = await this.itemRepository.findOne({ where: { isbn: dto.isbn } });
      if (existing) throw new BadRequestException('Ya existe un ítem con ese ISBN');
    }

    const item = this.itemRepository.create({
      ...dto,
      isbn: dto.isbn ?? null,
      description: dto.description ?? null,
      availableCopies: dto.totalCopies,
    });
    return this.itemRepository.save(item);
  }

  findAll(): Promise<Item[]> {
    return this.itemRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem con id ${id} no encontrado`);
    return item;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findOne(id);

    if (dto.isbn && dto.isbn !== item.isbn) {
      const existing = await this.itemRepository.findOne({ where: { isbn: dto.isbn } });
      if (existing) throw new BadRequestException('Ya existe un ítem con ese ISBN');
    }

    if (dto.totalCopies !== undefined) {
      const borrowed = item.totalCopies - item.availableCopies;
      if (dto.totalCopies < borrowed) {
        throw new BadRequestException(
          `No se puede reducir a ${dto.totalCopies} copias; hay ${borrowed} en préstamo`,
        );
      }
      item.availableCopies = dto.totalCopies - borrowed;
    }

    Object.assign(item, dto);
    return this.itemRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.itemRepository.remove(item);
  }
}
