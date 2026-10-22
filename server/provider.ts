import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PersistentBooking {
  ref: string;
  status: 'confirmed' | 'cancelled';
  occasion: string;
  guests: number;
  cost: number;
  idempotencyKey: string;
  createdAt: string;
  cancelledAt?: string;
  refundAmount?: number;
}

export class FictionalVenueProvider {
  private bookings: PersistentBooking[];
  private filepath: string;

  constructor(private directory = 'data') {
    mkdirSync(directory, { recursive: true });
    this.filepath = join(directory, 'fictional_bookings.json');
    this.bookings = existsSync(this.filepath)
      ? JSON.parse(readFileSync(this.filepath, 'utf8'))
      : [];
  }

  private save() {
    const tmp = this.filepath + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.bookings, null, 2));
    renameSync(tmp, this.filepath);
  }

  getBooking(ref: string): PersistentBooking | undefined {
    return structuredClone(this.bookings.find((b) => b.ref === ref));
  }

  listBookings(): PersistentBooking[] {
    return structuredClone(this.bookings);
  }

  createOrConfirm(data: {
    ref: string;
    occasion: string;
    guests: number;
    cost: number;
    idempotencyKey: string;
  }): PersistentBooking {
    const existing = this.bookings.find((b) => b.ref === data.ref);
    if (existing) {
      if (existing.idempotencyKey === data.idempotencyKey && existing.status === 'confirmed') {
        return structuredClone(existing);
      }
      existing.status = 'confirmed';
      existing.occasion = data.occasion;
      existing.guests = data.guests;
      existing.cost = data.cost;
      existing.idempotencyKey = data.idempotencyKey;
      this.save();
      return structuredClone(existing);
    }

    const newBooking: PersistentBooking = {
      ref: data.ref,
      status: 'confirmed',
      occasion: data.occasion,
      guests: data.guests,
      cost: data.cost,
      idempotencyKey: data.idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    this.bookings.push(newBooking);
    this.save();
    return structuredClone(newBooking);
  }

  cancel(ref: string, idempotencyKey: string): PersistentBooking {
    const booking = this.bookings.find((b) => b.ref === ref);
    if (!booking) {
      throw new Error(`Cannot cancel non-existent booking with reference "${ref}".`);
    }

    if (booking.status === 'cancelled') {
      return structuredClone(booking);
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    booking.refundAmount = booking.cost;
    booking.idempotencyKey = idempotencyKey;
    this.save();
    return structuredClone(booking);
  }
}
