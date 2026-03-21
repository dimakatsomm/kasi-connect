import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Seed categories & sub-categories (idempotent via upsert) ──────────────

  const foodCategory = await prisma.category.upsert({
    where: { name: 'Food' },
    update: {},
    create: {
      name: 'Food',
      description: 'Prepared food and meals',
      keywords: ['food', 'ukudla', 'dijo', 'kos'],
    },
  });

  const drinksCategory = await prisma.category.upsert({
    where: { name: 'Drinks' },
    update: {},
    create: {
      name: 'Drinks',
      description: 'Beverages and refreshments',
      keywords: ['drinks', 'drink', 'iziphuzo', 'dino', 'drinke', 'beverage'],
    },
  });

  const groceryCategory = await prisma.category.upsert({
    where: { name: 'Grocery' },
    update: {},
    create: {
      name: 'Grocery',
      description: 'General spaza shop items',
      keywords: ['grocery', 'groceries', 'spaza', 'ivenkile'],
    },
  });

  console.log(`✔ Categories: ${foodCategory.name}, ${drinksCategory.name}, ${groceryCategory.name}`);

  // ── Sub-categories ────────────────────────────────────────────────────────

  const kotaSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: foodCategory.id, name: 'Kota & Bunny Chow' } },
    update: {},
    create: {
      category_id: foodCategory.id,
      name: 'Kota & Bunny Chow',
      keywords: ['kota', 'bunny chow', 'spatlho', 'spatlo', 'quarter'],
    },
  });

  const papMealsSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: foodCategory.id, name: 'Pap Meals' } },
    update: {},
    create: {
      category_id: foodCategory.id,
      name: 'Pap Meals',
      keywords: ['pap', 'phutu', 'mogodu', 'wors', 'vleis'],
    },
  });

  const bakedSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: foodCategory.id, name: 'Baked Goods' } },
    update: {},
    create: {
      category_id: foodCategory.id,
      name: 'Baked Goods',
      keywords: ['vetkoek', 'magwinya', 'fatcake', 'fat cake', 'baked'],
    },
  });

  const softDrinksSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: drinksCategory.id, name: 'Soft Drinks' } },
    update: {},
    create: {
      category_id: drinksCategory.id,
      name: 'Soft Drinks',
      keywords: ['cold drink', 'cooldrink', 'fizzy', 'soft drink', 'soda', 'coke', 'fanta'],
    },
  });

  const waterSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: drinksCategory.id, name: 'Water' } },
    update: {},
    create: {
      category_id: drinksCategory.id,
      name: 'Water',
      keywords: ['water', 'amanzi', 'metsi'],
    },
  });

  console.log('  ✔ Sub-categories created');

  // ── Vendor ────────────────────────────────────────────────────────────────

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
        sub_category_id: kotaSub.id,
        name: 'Spatlho',
        description: 'chips, russian, cheese, special, atchar',
        price: 35.00,
        stock_level: 50,
        aliases: ['spatlho', 'spatlo', 'kota', 'quarter'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: papMealsSub.id,
        name: 'Pap & Mogodu',
        description: 'Creamy pap with slow-cooked tripe stew',
        price: 65.00,
        stock_level: 20,
        aliases: ['mogodu', 'tripe', 'pap and mogodu', 'pap en mogodu'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: papMealsSub.id,
        name: 'Pap & Wors',
        description: 'Pap with grilled boerewors and chakalaka',
        price: 70.00,
        stock_level: 25,
        aliases: ['pap and wors', 'pap en wors', 'wors', 'boerewors'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: bakedSub.id,
        name: 'Magwinya',
        description: 'Deep-fried dough ball',
        price: 20.00,
        stock_level: 40,
        aliases: ['vetkoek', 'fat cake', 'fatcake', 'amagwinya'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: softDrinksSub.id,
        name: 'Coke (500ml)',
        description: 'Coca-Cola 500ml bottle',
        price: 15.00,
        stock_level: 100,
        aliases: ['coke', 'coca cola', 'cold drink', 'cooldrink'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: waterSub.id,
        name: 'Water (500ml)',
        description: 'Still bottled water',
        price: 10.00,
        stock_level: 100,
        aliases: ['water', 'bottled water'],
      },
    ],
  });

  console.log(`  ✔ Created ${products.count} products`);

  // ── Demo vendor user (login: demo@kasiconnect.co.za / demo1234) ───────────
  const passwordHash = await bcrypt.hash('demo1234', 12);

  const demoUser = await prisma.vendorUser.upsert({
    where: { email: 'demo@kasiconnect.co.za' },
    update: {},
    create: {
      vendor_id: vendor.id,
      email: 'demo@kasiconnect.co.za',
      password_hash: passwordHash,
      name: 'Mama Hazel',
      role: 'owner',
    },
  });

  console.log(`✔ Demo user: ${demoUser.email} (vendor: ${vendor.name})`);

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
