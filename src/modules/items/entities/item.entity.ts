import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 255 })
  author: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  isbn: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'total_copies', default: 1 })
  totalCopies: number;

  @Column({ name: 'available_copies', default: 1 })
  availableCopies: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
