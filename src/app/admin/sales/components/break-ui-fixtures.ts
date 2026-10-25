import { Transaction, TransactionStats, Order } from '@/lib/types'

export type BreakUiMode = 'live' | 'worst' | 'empty' | 'one' | 'extreme'

export const WORST_CASE_STATS: TransactionStats = {
  salesCount: 1284,
  salesUnits: 1489200,
  salesRevenue: 987452631.75,
  returnsCount: 42,
  returnsUnits: 380,
  returnsAmount: 2458900.5,
  netRevenue: 984993731.25,
  profit: -4250890.5 // Testing negative profit alert state
}

export const WORST_CASE_SALES_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_worst_001_very_long_uuid_9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
    orderId: 'order_worst_001',
    type: 'sale',
    productId: 'prod_ram_darbar_idol',
    productName:
      'Antique Handcrafted Pure Silver Ram Darbar Temple Idol with Ornate Chhatra & Detailed Singhasan (Limited Edition Masterpiece)',
    category: 'Idols',
    brand: 'Devotional Arts & Heritage Silversmiths',
    metal: 'Silver',
    quantity: 1,
    pieceWeight: 1482.75,
    price: 345890.5,
    locationId: 'loc_flagship_store',
    locationName: 'Greater Kailash Flagship Mega Experience Centre (Store #01)',
    customerId: 'cust_aleksandra',
    customerName: 'Aleksandra Wiśniewska-Kowalczyk',
    date: '2026-10-25',
    notes: 'A96-2026-000001',
    createdAt: '2026-10-25T08:15:22.000Z'
  },
  {
    id: 'tx_worst_002',
    orderId: 'order_worst_002',
    type: 'sale',
    productId: 'prod_gold_banyantree',
    productName: '10g Banyan Tree Pure Gold Bar 999.9 Purity (CertiCard Sealed)',
    category: 'Bullions',
    brand: 'A96 Bullions',
    metal: 'Gold',
    quantity: 50,
    price: 84250.0,
    locationId: 'loc_alipore',
    locationName: 'Alipore Office',
    customerId: 'cust_christopher',
    customerName: 'Christopher Alexander Montgomery III, Esq.',
    date: '2026-10-24',
    notes: 'INV/2026-2027/NORTH-ZONE/BULK/98472910-FINAL',
    createdAt: '2026-10-24T14:30:00.000Z'
  },
  {
    id: 'tx_worst_003',
    type: 'sale',
    productId: 'prod_silver_coin',
    productName: '1g Silver Coin',
    category: 'Bullions',
    metal: 'Silver',
    quantity: 1,
    price: 95.0,
    locationId: 'loc_vault',
    locationName: 'Central Vault',
    customerId: 'cust_j',
    customerName: 'J', // Single letter name (tests short click target and initials)
    date: '2026-10-23',
    notes: 'TX-J-001',
    createdAt: '2026-10-23T11:00:00.000Z'
  },
  {
    id: 'tx_worst_004',
    type: 'sale',
    productId: 'prod_silver_ganesha',
    productName: 'Pure Silver Ganesha Idol (Handmade)',
    category: 'Idols',
    metal: 'Silver',
    quantity: 1,
    pieceWeight: 45.2,
    price: 8500.0,
    locationId: 'loc_alipore',
    locationName: 'Alipore Office',
    customerName: '', // Missing customer name (Walk-in customer)
    date: '2026-10-22',
    notes:
      'Customer requested deferred verification via NEFT UTR #HDFC000012349871234589012344; verified by store manager on site with sealed security envelope.',
    createdAt: '2026-10-22T09:20:00.000Z'
  },
  {
    id: 'tx_worst_005',
    orderId: 'order_worst_005',
    type: 'sale',
    productId: 'prod_gold_peacock',
    productName: '100g Cast Gold Ingot 999 Fine',
    category: 'Bullions',
    metal: 'Gold',
    quantity: 10,
    price: 785000.0,
    locationId: 'loc_vault',
    locationName: 'Central Vault',
    customerId: 'cust_holding_co',
    customerName: 'Bartholomew Fitzgerald & Sons Bullion Holdings International Pvt. Ltd.',
    date: '2026-10-21',
    notes: 'ORDER-BULLION-EXPEDITE-2026',
    isReversed: true, // Reversed order
    createdAt: '2026-10-21T16:45:00.000Z'
  }
]

export const WORST_CASE_RETURNS_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_ret_worst_001',
    type: 'return',
    productId: 'prod_ram_darbar_idol',
    productName:
      'Antique Handcrafted Pure Silver Ram Darbar Temple Idol with Ornate Chhatra & Detailed Singhasan (Limited Edition Masterpiece)',
    category: 'Idols',
    brand: 'Devotional Arts & Heritage Silversmiths',
    metal: 'Silver',
    quantity: 1,
    pieceWeight: 1482.75,
    price: 345890.5,
    locationId: 'loc_flagship_store',
    locationName: 'Greater Kailash Flagship Mega Experience Centre (Store #01)',
    customerName: 'Aleksandra Wiśniewska-Kowalczyk',
    date: '2026-10-25',
    notes: 'Customer returned after hallmarking certificate inspection; seal fully intact in velvet box.',
    createdAt: '2026-10-25T10:00:00.000Z'
  },
  {
    id: 'tx_ret_worst_002',
    type: 'return',
    productId: 'prod_gold_banyantree',
    productName: '10g Banyan Tree Pure Gold Bar 999.9 Purity',
    category: 'Bullions',
    metal: 'Gold',
    quantity: 2,
    price: 84250.0,
    locationId: 'loc_alipore',
    locationName: 'Alipore Office',
    customerName: 'Christopher Alexander Montgomery III, Esq.',
    date: '2026-10-24',
    notes: 'Exchange for 20g bar requested on spot.',
    createdAt: '2026-10-24T15:00:00.000Z'
  }
]

export const WORST_CASE_ORDERS: Order[] = [
  {
    id: 'order_worst_001',
    orderNo: 'A96-2026-000001',
    type: 'sale',
    customerId: 'cust_aleksandra',
    customerSnapshot: {
      displayName: 'Aleksandra Wiśniewska-Kowalczyk',
      mobileE164: '+919876543210'
    },
    locationId: 'loc_flagship_store',
    locationName: 'Greater Kailash Flagship Mega Experience Centre (Store #01)',
    date: '2026-10-25',
    createdBy: 'usr_admin',
    isReversed: false,
    lines: [
      {
        transactionId: 'tx_worst_001_very_long_uuid_9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
        productId: 'prod_ram_darbar_idol',
        productName:
          'Antique Handcrafted Pure Silver Ram Darbar Temple Idol with Ornate Chhatra & Detailed Singhasan (Limited Edition Masterpiece)',
        category: 'Idols',
        metal: 'Silver',
        qty: 1,
        pieceWeightMg: 1482750,
        unitPricePaise: 34589050,
        lineTotalPaise: 34589050
      }
    ],
    payments: [
      {
        mode: 'bank',
        amountPaise: 34589050,
        reference: 'NEFT-AXIS-982401928401928401'
      }
    ],
    totals: {
      units: 1,
      weightMg: {
        Gold: 0,
        Silver: 1482750
      },
      amountPaise: 34589050
    },
    notes: 'A96-2026-000001',
    createdAt: '2026-10-25T08:15:22.000Z'
  },
  {
    id: 'order_worst_002',
    orderNo: 'INV/2026-2027/NORTH-ZONE/BULK/98472910-FINAL',
    type: 'sale',
    customerId: 'cust_christopher',
    customerSnapshot: {
      displayName: 'Christopher Alexander Montgomery III, Esq.',
      mobileE164: '+919123456789'
    },
    locationId: 'loc_alipore',
    locationName: 'Alipore Office',
    date: '2026-10-24',
    createdBy: 'usr_admin',
    isReversed: false,
    lines: [
      {
        transactionId: 'tx_worst_002',
        productId: 'prod_gold_banyantree',
        productName: '10g Banyan Tree Pure Gold Bar 999.9 Purity (CertiCard Sealed)',
        category: 'Bullions',
        metal: 'Gold',
        qty: 50,
        unitPricePaise: 8425000,
        lineTotalPaise: 421250000
      }
    ],
    payments: [
      {
        mode: 'old_metal',
        amountPaise: 421250000,
        metal: 'Gold',
        weightMg: 520500,
        purity: '916 / 22K Hallmarked'
      }
    ],
    totals: {
      units: 50,
      weightMg: {
        Gold: 500000,
        Silver: 0
      },
      amountPaise: 421250000
    },
    notes: 'Bulk corporate allocation order',
    createdAt: '2026-10-24T14:30:00.000Z'
  },
  {
    id: 'order_worst_005',
    orderNo: 'ORDER-BULLION-EXPEDITE-2026',
    type: 'sale',
    customerId: 'cust_holding_co',
    customerSnapshot: {
      displayName: 'Bartholomew Fitzgerald & Sons Bullion Holdings International Pvt. Ltd.',
      mobileE164: '+919988776655'
    },
    locationId: 'loc_vault',
    locationName: 'Central Vault',
    date: '2026-10-21',
    createdBy: 'usr_admin',
    isReversed: true,
    lines: [
      {
        transactionId: 'tx_worst_005',
        productId: 'prod_gold_peacock',
        productName: '100g Cast Gold Ingot 999 Fine',
        category: 'Bullions',
        metal: 'Gold',
        qty: 10,
        unitPricePaise: 78500000,
        lineTotalPaise: 785000000
      }
    ],
    payments: [
      {
        mode: 'bank',
        amountPaise: 785000000,
        reference: 'RTGS-SBI-CORP-984210'
      }
    ],
    totals: {
      units: 10,
      weightMg: {
        Gold: 1000000,
        Silver: 0
      },
      amountPaise: 785000000
    },
    notes: 'Customer reversed prior to vault gate pass release',
    createdAt: '2026-10-21T16:45:00.000Z'
  }
]

// Single item scenario (tests pluralization: "1 item • 1 unit", "1 sale")
export const ONE_ITEM_STATS: TransactionStats = {
  salesCount: 1,
  salesUnits: 1,
  salesRevenue: 84250,
  returnsCount: 0,
  returnsUnits: 0,
  returnsAmount: 0,
  netRevenue: 84250,
  profit: 12500
}

export const ONE_ITEM_SALES: Transaction[] = [
  {
    id: 'tx_one_001',
    type: 'sale',
    productId: 'prod_gold_banyantree',
    productName: '10g Banyan Tree Pure Gold Bar',
    category: 'Bullions',
    metal: 'Gold',
    quantity: 1,
    price: 84250,
    locationId: 'loc_alipore',
    locationName: 'Alipore Office',
    customerName: 'Sam Lee',
    date: '2026-10-25',
    notes: 'INV-SINGLE-001',
    createdAt: '2026-10-25T09:00:00.000Z'
  }
]

// Extreme Numbers scenario (Crores, fractional paise, large quantities)
export const EXTREME_STATS: TransactionStats = {
  salesCount: 999999,
  salesUnits: 48921045,
  salesRevenue: 9874567890.85, // ₹987.45 Crores
  returnsCount: 12450,
  returnsUnits: 98200,
  returnsAmount: 125489000.5,
  netRevenue: 9749078890.35,
  profit: -845012390.25 // Major loss
}

// Zero/Empty state
export const EMPTY_STATS: TransactionStats = {
  salesCount: 0,
  salesUnits: 0,
  salesRevenue: 0,
  returnsCount: 0,
  returnsUnits: 0,
  returnsAmount: 0,
  netRevenue: 0,
  profit: 0
}
