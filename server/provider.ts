import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type ServiceType = 'venue' | 'catering' | 'cake';

export interface PersistentServiceBooking {
  ref: string;
  serviceType: ServiceType;
  itemKey: string;
  name: string;
  status: 'confirmed' | 'cancelled';
  occasion: string;
  guests: number;
  cost: number;
  idempotencyKey: string;
  cancellationPolicy: string;
  refundPolicyRate: number; // 1.0 = 100% refund, 0.5 = 50% refund
  refundAmount?: number;
  createdAt: string;
  cancelledAt?: string;
  metadata?: Record<string, unknown>;
}

// Backward-compatible alias for existing tests
export type PersistentBooking = PersistentServiceBooking;

export interface InventoryItem {
  key: string;
  serviceType: ServiceType;
  name: string;
  description: string;
  basePrice?: number;
  pricePerGuest?: number;
  minGuests?: number;
  maxGuests?: number;
  available: boolean;
  cancellationPolicy: string;
  refundPolicyRate: number;
}

export const FICTIONAL_INVENTORY: Record<ServiceType, InventoryItem[]> = {
  venue: [
    {
      key: 'garden_hall',
      serviceType: 'venue',
      name: 'Garden Hall (The Grand Orchid)',
      description: 'Lush outdoor garden banquet lawn with evening lighting for up to 50 guests.',
      basePrice: 12000,
      minGuests: 10,
      maxGuests: 50,
      available: true,
      cancellationPolicy: '100% refundable prior to event date.',
      refundPolicyRate: 1.0,
    },
    {
      key: 'royal_heritage_palace',
      serviceType: 'venue',
      name: 'Royal Heritage Palace Grand Lawn',
      description: 'Palatial estate grounds for luxury milestone galas.',
      basePrice: 35000,
      minGuests: 20,
      maxGuests: 200,
      available: false, // out of budget / restricted
      cancellationPolicy: '50% non-refundable deposit.',
      refundPolicyRate: 0.5,
    },
  ],
  catering: [
    {
      key: 'gourmet_buffet',
      serviceType: 'catering',
      name: 'Gourmet Celebration Buffet',
      description: 'Multi-course celebratory buffet with vegetarian and non-vegetarian selections.',
      pricePerGuest: 600,
      minGuests: 15,
      maxGuests: 100,
      available: true,
      cancellationPolicy: '100% refundable prior to ingredient provisioning.',
      refundPolicyRate: 1.0,
    },
    {
      key: 'veg_feast',
      serviceType: 'catering',
      name: 'Royal Vegetarian Feast',
      description: 'Pure vegetarian regional banquet prepared fresh on-site.',
      pricePerGuest: 480,
      minGuests: 15,
      maxGuests: 100,
      available: true,
      cancellationPolicy: '100% refundable prior to ingredient provisioning.',
      refundPolicyRate: 1.0,
    },
    {
      key: 'luxury_banquet',
      serviceType: 'catering',
      name: 'Luxury 7-Course Banquet',
      description: 'Artisanal chef-table multi-course experience.',
      basePrice: 32000,
      available: false,
      cancellationPolicy: '50% cancellation fee applies.',
      refundPolicyRate: 0.5,
    },
  ],
  cake: [
    {
      key: 'milestone_truffle_3kg',
      serviceType: 'cake',
      name: 'Custom Milestone 3-Tier Belgian Chocolate Truffle Cake',
      description: 'Handcrafted 3kg chocolate truffle milestone cake with custom piping.',
      basePrice: 3500,
      available: true,
      cancellationPolicy: '100% refundable if cancelled prior to baking start.',
      refundPolicyRate: 1.0,
    },
    {
      key: 'custom_photo_cake_2kg',
      serviceType: 'cake',
      name: 'Personalized Photo Celebration Cake',
      description: '2kg butterscotch photo cake with edible milestone print.',
      basePrice: 2400,
      available: true,
      cancellationPolicy: 'Custom print fee non-refundable (75% refund).',
      refundPolicyRate: 0.75,
    },
  ],
};

export class FictionalVenueProvider {
  private bookings: PersistentServiceBooking[];
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

  getBooking(ref: string): PersistentServiceBooking | undefined {
    return structuredClone(this.bookings.find((b) => b.ref === ref));
  }

  getBookingByIdempotencyKey(key: string): PersistentServiceBooking | undefined {
    return structuredClone(this.bookings.find((b) => b.idempotencyKey === key));
  }

  listBookingsForMission(missionId: string): PersistentServiceBooking[] {
    const prefix = `ATLAS-${missionId.slice(0, 8).toUpperCase()}`;
    return structuredClone(this.bookings.filter((b) => b.ref === prefix || b.ref.startsWith(`${prefix}-`)));
  }

  listBookings(): PersistentServiceBooking[] {
    return structuredClone(this.bookings);
  }

  getInventory(serviceType?: ServiceType): InventoryItem[] {
    if (serviceType) return structuredClone(FICTIONAL_INVENTORY[serviceType] ?? []);
    return [
      ...structuredClone(FICTIONAL_INVENTORY.venue),
      ...structuredClone(FICTIONAL_INVENTORY.catering),
      ...structuredClone(FICTIONAL_INVENTORY.cake),
    ];
  }

  getInventoryItem(serviceType: ServiceType, itemKey: string): InventoryItem | undefined {
    const items = FICTIONAL_INVENTORY[serviceType] ?? [];
    const found = items.find((i) => i.key === itemKey);
    return found ? structuredClone(found) : undefined;
  }

  calculatePrice(
    serviceType: ServiceType,
    itemKey: string,
    guests = 25
  ): { item: InventoryItem; totalCost: number; available: boolean } {
    const items = FICTIONAL_INVENTORY[serviceType] ?? [];
    const item = items.find((i) => i.key === itemKey) ?? items[0];
    if (!item) throw new Error(`Unknown inventory item "${itemKey}" for service "${serviceType}".`);

    let totalCost = item.basePrice ?? 0;
    if (item.pricePerGuest) {
      totalCost = item.pricePerGuest * guests;
    }

    return { item: structuredClone(item), totalCost, available: item.available };
  }

  /**
   * Universal booking for venue, catering, or cake services.
   */
  createOrConfirm(data: {
    ref: string;
    occasion: string;
    guests: number;
    cost: number;
    idempotencyKey: string;
    serviceType?: ServiceType;
    itemKey?: string;
    metadata?: Record<string, unknown>;
  }): PersistentServiceBooking {
    const serviceType = data.serviceType ?? 'venue';
    const itemKey = data.itemKey ?? (serviceType === 'venue' ? 'garden_hall' : serviceType === 'catering' ? 'gourmet_buffet' : 'milestone_truffle_3kg');
    const inventory = (FICTIONAL_INVENTORY[serviceType] ?? []).find((i) => i.key === itemKey);
    const itemName = inventory?.name ?? (serviceType === 'venue' ? 'Garden Hall' : serviceType === 'catering' ? 'Catering Buffet' : 'Celebration Cake');
    const policy = inventory?.cancellationPolicy ?? '100% refundable prior to event date.';
    const policyRate = inventory?.refundPolicyRate ?? 1.0;

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
      if (data.metadata) existing.metadata = { ...existing.metadata, ...data.metadata };
      this.save();
      return structuredClone(existing);
    }

    const newBooking: PersistentServiceBooking = {
      ref: data.ref,
      serviceType,
      itemKey,
      name: itemName,
      status: 'confirmed',
      occasion: data.occasion,
      guests: data.guests,
      cost: data.cost,
      idempotencyKey: data.idempotencyKey,
      cancellationPolicy: policy,
      refundPolicyRate: policyRate,
      createdAt: new Date().toISOString(),
      metadata: data.metadata,
    };

    this.bookings.push(newBooking);
    this.save();
    return structuredClone(newBooking);
  }

  /**
   * Compensates/cancels a service booking with strict policy accounting.
   */
  cancel(ref: string, idempotencyKey: string): PersistentServiceBooking {
    const booking = this.bookings.find((b) => b.ref === ref);
    if (!booking) {
      throw new Error(`Cannot cancel non-existent fictional booking with reference "${ref}".`);
    }

    if (booking.status === 'cancelled') {
      return structuredClone(booking);
    }

    const refundAmount = Math.round(booking.cost * booking.refundPolicyRate);

    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    booking.refundAmount = refundAmount;
    booking.idempotencyKey = idempotencyKey;
    this.save();
    return structuredClone(booking);
  }
}
