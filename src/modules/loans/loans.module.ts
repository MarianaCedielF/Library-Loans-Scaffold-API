import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsModule } from '../items/items.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { Loan } from './entities/loan.entity';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [TypeOrmModule.forFeature([Loan]), ItemsModule, ReservationsModule],
  providers: [LoansService],
  controllers: [LoansController],
})
export class LoansModule {}
