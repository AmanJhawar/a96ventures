import { Product, Location, Transaction, ProductCategory, MetalType } from '@/lib/types'

export type InventoryTab = 'products' | 'purchases' | 'movements' | 'archived-audit'

export interface PurchaseLineItem {
  id: string
  productId: string
  quantity: string
  price: string
  pieceWeights: number[]
  pieceInput: string
}

export interface TransferLineItem {
  id: string
  productId: string
  quantity: string
  pieceWeights?: number[]
}

export type MovementType = 'transfer' | 'adjustment' | 'repair' | 'melt'
export type MovementSubtype = 'transfer' | 'adjustment' | 'repair' | 'melt'

export type ProductSortOption =
  | 'last_modified'
  | 'name_asc'
  | 'name_desc'
  | 'sku_asc'
  | 'weight_desc'
  | 'weight_asc'
  | 'stock_desc'
  | 'stock_asc'
  | 'category'
  | 'value_desc'
  | 'value_asc'
