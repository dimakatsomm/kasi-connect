import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Parse flags ─────────────────────────────────────────────────────────────
// CLI:  tsx prisma/seed.ts --app | --demo | --app --demo | (no flag = both)
// ENV:  SEED_MODE=app | demo | all | none  (used in Docker; overrides CLI)
const seedMode = process.env.SEED_MODE?.toLowerCase();
const args = process.argv.slice(2);
const explicitApp = seedMode ? ['app', 'all'].includes(seedMode) : args.includes('--app');
const explicitDemo = seedMode ? ['demo', 'all'].includes(seedMode) : args.includes('--demo');
const runNone = seedMode === 'none';
const runAll = !runNone && !explicitApp && !explicitDemo;
const seedApp = !runNone && (runAll || explicitApp);
const seedDemo = !runNone && (runAll || explicitDemo);

// ── Official app data (categories & sub-categories) ────────────────────────

interface SubCategoryRefs {
  kotaSub: { id: string };
  papMealsSub: { id: string };
  bakedSub: { id: string };
  softDrinksSub: { id: string };
  waterSub: { id: string };
  breadSub: { id: string };
  snacksSub: { id: string };
  essentialsSub: { id: string };
}

async function seedAppData(): Promise<SubCategoryRefs> {
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

  const breadSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: groceryCategory.id, name: 'Bread & Staples' } },
    update: {},
    create: {
      category_id: groceryCategory.id,
      name: 'Bread & Staples',
      keywords: ['bread', 'isinkwa', 'brood', 'mealie meal', 'maize', 'rice', 'sugar'],
    },
  });

  const snacksSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: groceryCategory.id, name: 'Snacks & Sweets' } },
    update: {},
    create: {
      category_id: groceryCategory.id,
      name: 'Snacks & Sweets',
      keywords: ['chips', 'simba', 'lays', 'sweets', 'chocolate', 'biscuits'],
    },
  });

  const essentialsSub = await prisma.subCategory.upsert({
    where: { uq_category_subcategory: { category_id: groceryCategory.id, name: 'Household Essentials' } },
    update: {},
    create: {
      category_id: groceryCategory.id,
      name: 'Household Essentials',
      keywords: ['soap', 'candle', 'matches', 'paraffin', 'airtime', 'electricity'],
    },
  });

  console.log('  ✔ Sub-categories created');

  return { kotaSub, papMealsSub, bakedSub, softDrinksSub, waterSub, breadSub, snacksSub, essentialsSub };
}

// ── Demo data (vendor, products & demo user) ────────────────────────────────

async function seedDemoData(subCats?: SubCategoryRefs) {
  // If app data wasn't seeded in this run, look up existing sub-categories
  const refs = subCats ?? {
    kotaSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Kota & Bunny Chow' } }),
    papMealsSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Pap Meals' } }),
    bakedSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Baked Goods' } }),
    softDrinksSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Soft Drinks' } }),
    waterSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Water' } }),
    breadSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Bread & Staples' } }),
    snacksSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Snacks & Sweets' } }),
    essentialsSub: await prisma.subCategory.findFirstOrThrow({ where: { name: 'Household Essentials' } }),
  };

  const vendor = await prisma.vendor.upsert({
    where: { phone: '27833361867' },
    update: {},
    create: {
      name: "Mama Hazel's Kitchen",
      type: 'food',
      phone: '27833361867',
      whatsapp_number: '27833361867',
      address: '15 Maunde Street, Atteridgeville, Pretoria',
      latitude: -25.7764,
      longitude: 28.0827,
      delivery_fee: 15.00,
      is_active: true,
    },
  });

  console.log(`✔ Vendor: ${vendor.name} (${vendor.id})`);

  // Remove existing daily specials & products for this vendor so the script is idempotent
  await prisma.dailySpecial.deleteMany({
    where: { product: { vendor_id: vendor.id } },
  });
  await prisma.product.deleteMany({ where: { vendor_id: vendor.id } });

  const products = await prisma.product.createMany({
    data: [
      {
        vendor_id: vendor.id,
        sub_category_id: refs.kotaSub.id,
        name: 'Spatlho',
        description: 'chips, russian, cheese, special, atchar',
        price: 35.00,
        stock_level: 50,
        aliases: ['spatlho', 'spatlo', 'kota', 'quarter'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: refs.papMealsSub.id,
        name: 'Pap & Mogodu',
        description: 'Creamy pap with slow-cooked tripe stew',
        price: 65.00,
        stock_level: 20,
        aliases: ['mogodu', 'tripe', 'pap and mogodu', 'pap en mogodu'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: refs.papMealsSub.id,
        name: 'Pap & Wors',
        description: 'Pap with grilled boerewors and chakalaka',
        price: 70.00,
        stock_level: 25,
        aliases: ['pap and wors', 'pap en wors', 'wors', 'boerewors'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: refs.bakedSub.id,
        name: 'Magwinya',
        description: 'Deep-fried dough ball',
        price: 20.00,
        stock_level: 40,
        aliases: ['vetkoek', 'fat cake', 'fatcake', 'amagwinya'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: refs.softDrinksSub.id,
        name: 'Coke (500ml)',
        description: 'Coca-Cola 500ml bottle',
        price: 15.00,
        stock_level: 100,
        aliases: ['coke', 'coca cola', 'cold drink', 'cooldrink'],
      },
      {
        vendor_id: vendor.id,
        sub_category_id: refs.waterSub.id,
        name: 'Water (500ml)',
        description: 'Still bottled water',
        price: 10.00,
        stock_level: 100,
        aliases: ['water', 'bottled water'],
      },
    ],
  });

  console.log(`  ✔ Created ${products.count} products`);

  // Demo vendor user (login: demo@kasiconnect.co.za or 27833361867 / demo1234)
  const passwordHash = await bcrypt.hash('demo1234', 12);

  const demoUser = await prisma.vendorUser.upsert({
    where: { email: 'demo@kasiconnect.co.za' },
    update: { phone: '27833361867' },
    create: {
      vendor_id: vendor.id,
      email: 'demo@kasiconnect.co.za',
      phone: '27833361867',
      password_hash: passwordHash,
      name: 'Mama Hazel',
      role: 'owner',
    },
  });

  console.log(`✔ Demo user: ${demoUser.email} / ${demoUser.phone} (vendor: ${vendor.name})`);

  // ── Additional demo vendors ────────────────────────────────────────────────

  // Helper to seed a vendor + products idempotently
  async function seedVendor(
    vendorData: Parameters<typeof prisma.vendor.upsert>[0]['create'],
    productsData: Array<{ sub_category_id: string; name: string; description: string; price: number; stock_level: number; aliases: string[] }>
  ) {
    const v = await prisma.vendor.upsert({
      where: { phone: vendorData.phone },
      update: {},
      create: vendorData,
    });
    await prisma.dailySpecial.deleteMany({ where: { product: { vendor_id: v.id } } });
    await prisma.product.deleteMany({ where: { vendor_id: v.id } });
    const result = await prisma.product.createMany({
      data: productsData.map((p) => ({ vendor_id: v.id, ...p })),
    });
    console.log(`✔ Vendor: ${v.name} — ${result.count} products (${v.address})`);
    return v;
  }

  // ── Thatchfield Restaurants ──

  await seedVendor(
    {
      name: "Bra T's Flame Grill",
      type: 'food',
      phone: '27810000001',
      whatsapp_number: '27810000001',
      address: '12 Thatchfield Close, Thatchfield, Centurion',
      latitude: -25.8450,
      longitude: 28.1580,
      delivery_fee: 20.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.kotaSub.id, name: 'Kota Special', description: 'Full house kota with chips, polony, cheese, russian, atchar', price: 45.00, stock_level: 30, aliases: ['kota', 'full house', 'special kota'] },
      { sub_category_id: refs.papMealsSub.id, name: 'Flame Grilled Chicken & Pap', description: 'Quarter chicken flame grilled with pap and chakalaka', price: 75.00, stock_level: 20, aliases: ['chicken', 'grilled chicken', 'chicken and pap'] },
      { sub_category_id: refs.papMealsSub.id, name: 'Mogodu & Pap Combo', description: 'Tripe stew with creamy pap and spinach', price: 70.00, stock_level: 15, aliases: ['mogodu', 'tripe', 'mogodu combo'] },
      { sub_category_id: refs.bakedSub.id, name: 'Vetkoek & Mince', description: 'Deep-fried vetkoek stuffed with curried mince', price: 30.00, stock_level: 40, aliases: ['vetkoek', 'vetkoek mince', 'magwinya'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Fanta Orange (500ml)', description: 'Fanta Orange 500ml', price: 15.00, stock_level: 60, aliases: ['fanta', 'orange', 'fanta orange'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Coke (500ml)', description: 'Coca-Cola 500ml', price: 15.00, stock_level: 60, aliases: ['coke', 'coca cola'] },
    ]
  );

  await seedVendor(
    {
      name: "Sisi Phumla's Kitchen",
      type: 'food',
      phone: '27810000002',
      whatsapp_number: '27810000002',
      address: '45 Thatchfield Avenue, Thatchfield, Centurion',
      latitude: -25.8465,
      longitude: 28.1595,
      delivery_fee: 15.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.papMealsSub.id, name: 'Pap & Steak', description: 'Pap with tender beef steak and gravy', price: 80.00, stock_level: 20, aliases: ['steak', 'pap and steak', 'beef'] },
      { sub_category_id: refs.papMealsSub.id, name: 'Pap & Wors', description: 'Pap with grilled boerewors and tomato relish', price: 65.00, stock_level: 25, aliases: ['wors', 'pap and wors', 'boerewors'] },
      { sub_category_id: refs.kotaSub.id, name: 'Bunny Chow (Chicken)', description: 'Quarter loaf filled with chicken curry', price: 55.00, stock_level: 15, aliases: ['bunny chow', 'bunny', 'chicken bunny'] },
      { sub_category_id: refs.bakedSub.id, name: 'Scones (4 pack)', description: 'Homemade buttermilk scones', price: 25.00, stock_level: 30, aliases: ['scones', 'scone'] },
      { sub_category_id: refs.waterSub.id, name: 'Water (500ml)', description: 'Still water', price: 10.00, stock_level: 80, aliases: ['water'] },
    ]
  );

  // ── Thatchfield Spaza Shops ──

  await seedVendor(
    {
      name: "Shopright Spaza - Thatchfield",
      type: 'retail',
      phone: '27810000003',
      whatsapp_number: '27810000003',
      address: '8 Thatchfield Gardens, Thatchfield, Centurion',
      latitude: -25.8440,
      longitude: 28.1570,
      delivery_fee: 10.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.breadSub.id, name: 'White Bread', description: 'Albany Superior white bread loaf', price: 18.00, stock_level: 50, aliases: ['bread', 'white bread', 'isinkwa', 'brood'] },
      { sub_category_id: refs.breadSub.id, name: 'Maize Meal (2.5kg)', description: 'Iwisa maize meal 2.5kg', price: 35.00, stock_level: 30, aliases: ['maize meal', 'mealie meal', 'iwisa', 'phutu'] },
      { sub_category_id: refs.breadSub.id, name: 'Rice (2kg)', description: 'Tastic rice 2kg', price: 40.00, stock_level: 25, aliases: ['rice', 'tastic'] },
      { sub_category_id: refs.snacksSub.id, name: 'Simba Chips', description: 'Simba chips 125g assorted', price: 15.00, stock_level: 80, aliases: ['chips', 'simba', 'crisps'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Coke (2L)', description: 'Coca-Cola 2 litre', price: 25.00, stock_level: 40, aliases: ['coke', '2l coke', 'two litre coke'] },
      { sub_category_id: refs.essentialsSub.id, name: 'Sunlight Soap', description: 'Sunlight laundry bar', price: 12.00, stock_level: 60, aliases: ['soap', 'sunlight', 'washing soap'] },
      { sub_category_id: refs.essentialsSub.id, name: 'Candles (6 pack)', description: 'Household candles 6 pack', price: 18.00, stock_level: 40, aliases: ['candles', 'candle'] },
      { sub_category_id: refs.waterSub.id, name: 'Water (1.5L)', description: 'Still water 1.5 litre', price: 15.00, stock_level: 50, aliases: ['water', 'big water'] },
    ]
  );

  // ── Atteridgeville Spaza Shop ──

  await seedVendor(
    {
      name: "Malome Joe's Spaza",
      type: 'retail',
      phone: '27810000004',
      whatsapp_number: '27810000004',
      address: '32 Seeiso Street, Atteridgeville, Pretoria',
      latitude: -25.7750,
      longitude: 28.0810,
      delivery_fee: 10.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.breadSub.id, name: 'Brown Bread', description: 'Albany brown bread loaf', price: 18.00, stock_level: 40, aliases: ['bread', 'brown bread', 'brood'] },
      { sub_category_id: refs.breadSub.id, name: 'Sugar (2.5kg)', description: 'White sugar 2.5kg', price: 42.00, stock_level: 20, aliases: ['sugar', 'swekere'] },
      { sub_category_id: refs.breadSub.id, name: 'Maize Meal (5kg)', description: 'Ace maize meal 5kg', price: 60.00, stock_level: 15, aliases: ['maize meal', 'mealie meal', 'ace'] },
      { sub_category_id: refs.snacksSub.id, name: 'NikNaks', description: 'NikNaks cheese flavour 135g', price: 15.00, stock_level: 50, aliases: ['niknaks', 'nik naks', 'cheese puffs'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Sprite (500ml)', description: 'Sprite lemon-lime 500ml', price: 15.00, stock_level: 60, aliases: ['sprite', 'lemon lime'] },
      { sub_category_id: refs.essentialsSub.id, name: 'Matches (box)', description: 'Lion safety matches', price: 5.00, stock_level: 100, aliases: ['matches', 'match box'] },
      { sub_category_id: refs.essentialsSub.id, name: 'Paraffin (1L)', description: 'Paraffin 1 litre', price: 20.00, stock_level: 30, aliases: ['paraffin', 'parafini'] },
    ]
  );

  // ── Atteridgeville Restaurant ──

  await seedVendor(
    {
      name: "Kota Kingdom",
      type: 'food',
      phone: '27810000005',
      whatsapp_number: '27810000005',
      address: '5 Church Street, Atteridgeville, Pretoria',
      latitude: -25.7770,
      longitude: 28.0840,
      delivery_fee: 15.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.kotaSub.id, name: 'Classic Kota', description: 'Chips, polony, atchar in a quarter loaf', price: 25.00, stock_level: 40, aliases: ['kota', 'classic kota', 'quarter'] },
      { sub_category_id: refs.kotaSub.id, name: 'King Kota', description: 'Chips, russian, cheese, egg, polony, atchar', price: 50.00, stock_level: 30, aliases: ['king kota', 'full house kota', 'big kota'] },
      { sub_category_id: refs.papMealsSub.id, name: 'Pap & Chicken Feet', description: 'Pap with spicy chicken feet (amanqina)', price: 45.00, stock_level: 25, aliases: ['chicken feet', 'amanqina', 'walkie talkies'] },
      { sub_category_id: refs.bakedSub.id, name: 'Fat Cake & Polony', description: 'Vetkoek with polony and atchar', price: 15.00, stock_level: 50, aliases: ['fat cake', 'vetkoek', 'magwinya'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Coke (330ml)', description: 'Coca-Cola can 330ml', price: 12.00, stock_level: 80, aliases: ['coke', 'coke can', 'cola'] },
    ]
  );

  // ── Mamelodi Restaurant ──

  await seedVendor(
    {
      name: "Ntate Pule's Braai",
      type: 'food',
      phone: '27810000006',
      whatsapp_number: '27810000006',
      address: '18 Tsamaya Road, Mamelodi East, Pretoria',
      latitude: -25.7200,
      longitude: 28.3960,
      delivery_fee: 20.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.papMealsSub.id, name: 'Braai Combo', description: 'Pap, wors, chop and salad', price: 90.00, stock_level: 15, aliases: ['braai', 'braai combo', 'combo'] },
      { sub_category_id: refs.papMealsSub.id, name: 'Mogodu Monday Special', description: 'Large mogodu and pap with dombolo', price: 75.00, stock_level: 20, aliases: ['mogodu', 'mogodu monday', 'tripe'] },
      { sub_category_id: refs.kotaSub.id, name: 'Spatlho Supreme', description: 'Loaded kota with everything', price: 55.00, stock_level: 25, aliases: ['spatlho', 'kota', 'supreme'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Iron Brew (500ml)', description: 'Sparletta Iron Brew 500ml', price: 12.00, stock_level: 50, aliases: ['iron brew', 'sparletta'] },
    ]
  );

  // ── Mamelodi Spaza Shop ──

  await seedVendor(
    {
      name: "Corner Spaza Mamelodi",
      type: 'retail',
      phone: '27810000007',
      whatsapp_number: '27810000007',
      address: '99 Stanza Bopape Street, Mamelodi West, Pretoria',
      latitude: -25.7185,
      longitude: 28.3930,
      delivery_fee: 8.00,
      is_active: true,
    },
    [
      { sub_category_id: refs.breadSub.id, name: 'White Bread', description: 'Sasko white bread loaf', price: 17.00, stock_level: 50, aliases: ['bread', 'white bread', 'isinkwa'] },
      { sub_category_id: refs.breadSub.id, name: 'Eggs (6 pack)', description: 'Free range eggs 6 pack', price: 30.00, stock_level: 25, aliases: ['eggs', 'egg', 'amaqanda'] },
      { sub_category_id: refs.snacksSub.id, name: 'Lays Chips', description: 'Lays salted 120g', price: 18.00, stock_level: 40, aliases: ['lays', 'chips', 'crisps'] },
      { sub_category_id: refs.softDrinksSub.id, name: 'Jive (1L)', description: 'Jive cold drink 1 litre', price: 15.00, stock_level: 35, aliases: ['jive', 'cold drink'] },
      { sub_category_id: refs.essentialsSub.id, name: 'Airtime Voucher (R10)', description: 'Prepaid airtime voucher', price: 10.00, stock_level: 200, aliases: ['airtime', 'airtime voucher', 'recharge'] },
    ]
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (runNone) {
    console.log('SEED_MODE=none — skipping seed.');
    return;
  }

  let subCats: SubCategoryRefs | undefined;

  if (seedApp) {
    console.log('── Seeding app data (categories & sub-categories) ──');
    subCats = await seedAppData();
  }

  if (seedDemo) {
    console.log('── Seeding demo data (vendor, products & user) ──');
    await seedDemoData(subCats);
  }

  console.log('\n🚀 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
