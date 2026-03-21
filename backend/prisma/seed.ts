import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Upsert vendor by phone to make script idempotent
  const vendor = await prisma.vendor.upsert({
    where: { phone: '27731234567' },
    update: {},
    create: {
      name: "Mama Hazel's Kitchen",
      type: 'food',
      phone: '27731234567',
      whatsapp_number: '27731234567',
      address: '15 Maunde Street, Atteridgeville, Pretoria',
      latitude: -25.7764,
      longitude: 28.0827,
      delivery_fee: 15.00,
      is_active: true,
    },
  });

  console.log(`✔ Vendor: ${vendor.name} (${vendor.id})`);

  // Remove existing products for this vendor so the script is idempotent
  await prisma.product.deleteMany({ where: { vendor_id: vendor.id } });

  const products = await prisma.product.createMany({
    data: [
      {
        vendor_id: vendor.id,
        name: 'Spatlho',
        description: 'chips, russian, cheese, special, atchar',
        price: 35.00,
        stock_level: 50,
        aliases: ['spatlho', 'spatlo', 'kota', 'quarter'],
      },
      {
        vendor_id: vendor.id,
        name: 'Pap & Mogodu',
        description: 'Creamy pap with slow-cooked tripe stew',
        price: 65.00,
        stock_level: 20,
        aliases: ['mogodu', 'tripe', 'pap and mogodu', 'pap en mogodu'],
      },
      {
        vendor_id: vendor.id,
        name: 'Pap & Wors',
        description: 'Pap with grilled boerewors and chakalaka',
        price: 70.00,
        stock_level: 25,
        aliases: ['pap and wors', 'pap en wors', 'wors', 'boerewors'],
      },
      {
        vendor_id: vendor.id,
        name: 'Magwinya',
        description: 'Deep-fried dough ball',
        price: 20.00,
        stock_level: 40,
        aliases: ['vetkoek', 'fat cake', 'fatcake', 'amagwinya'],
      },
      {
        vendor_id: vendor.id,
        name: 'Coke (500ml)',
        description: 'Coca-Cola 500ml bottle',
        price: 15.00,
        stock_level: 100,
        aliases: ['coke', 'coca cola', 'cold drink', 'cooldrink'],
      },
      {
        vendor_id: vendor.id,
        name: 'Water (500ml)',
        description: 'Still bottled water',
        price: 10.00,
        stock_level: 100,
        aliases: ['water', 'bottled water'],
      },
    ],
  });

  console.log(`  ✔ Created ${products.count} products`);
  console.log('\n🚀 Demo seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
