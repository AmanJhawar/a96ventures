import { useState, useEffect, useMemo } from 'react'
import { getCatalogItems, getStoreCategories, saveInventoryItem, deleteInventoryItem } from '@/lib/services/catalog.service'
import { 
  InventoryItem, 
  buildVariantCombos, 
  hasStonesCategory,
  buildSearchTerms
} from '@/lib/domain/inventory'
import { VariantDetail } from '@/lib/types'

const emptyForm: Partial<InventoryItem> = {
  id: '', sku: '', name: '', category: '', hasVariants: false,
  standardSizes: [], customSizes: [], standardPurities: [], customPurities: [],
  standardWeights: [], customWeights: [], standardStones: [], customStones: [],
  weight: '', material: '', description: '', imageFile: '',
  orderIndex: 0
}

const numericFilter = (val: string) => val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1')

export function useInventoryForm() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({ ...emptyForm })
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [customPurityInput, setCustomPurityInput] = useState('')
  
  const [variantSkuInputs, setVariantSkuInputs] = useState<Record<string, string>>({})
  const [variantWeightInputs, setVariantWeightInputs] = useState<Record<string, string>>({})
  const [variantImageInputs, setVariantImageInputs] = useState<Record<string, string[]>>({})

  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryFocusedIndex, setCategoryFocusedIndex] = useState(-1)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, catItems] = await Promise.all([
          getStoreCategories(),
          getCatalogItems()
        ])
        setCategories(cats)
        setItems(catItems as unknown as InventoryItem[])
      } catch (err) {
        console.error("Error fetching data", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const executeDelete = async () => {
    if (!deleteId) return
    try {
      await deleteInventoryItem(deleteId)
      setItems(items.filter(i => i.id !== deleteId))
    } catch (err) {
      console.error("Error deleting", err)
      alert("Failed to delete product. Please check your permissions.")
    } finally {
      setDeleteId(null)
    }
  }

  const combos = useMemo(() => buildVariantCombos(formData), [formData])

  const handleEdit = (item: InventoryItem) => {
    setFormData({ ...item, orderIndex: item.orderIndex || 0 })
    const skuInputs: Record<string, string> = {}
    const weightInputs: Record<string, string> = {}
    const combos = buildVariantCombos(item)
    if (item.variantSkus) {
      for (const [sku, detail] of Object.entries(item.variantSkus)) {
        const match = combos.find(c =>
          c.attrs.size === detail.size &&
          c.attrs.purity === detail.purity &&
          c.attrs.stone === detail.stone
        )
        if (match) {
          skuInputs[match.key] = sku
          weightInputs[match.key] = detail.weight || ''
        }
      }
    }
    setVariantSkuInputs(skuInputs)
    setVariantWeightInputs(weightInputs)
    setVariantImageInputs(item.variantImages || {})
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ ...emptyForm })
    setCustomSizeInput('')
    setCustomPurityInput('')
    setVariantSkuInputs({})
    setVariantWeightInputs({})
    setVariantImageInputs({})
  }

  const cleanupOrphanedInputs = (newFormData: Partial<InventoryItem>) => {
    const validKeys = new Set(buildVariantCombos(newFormData).map(c => c.key))
    
    setVariantSkuInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })
    
    setVariantWeightInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })

    setVariantImageInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })
  }

  const getMatrixFields = () => {
    if (hasStonesCategory(formData.category)) return ['standardStones', 'customStones'] as const
    if (formData.category?.includes('Bullion')) return ['standardWeights', 'customWeights'] as const
    return ['standardSizes', 'customSizes'] as const
  }

  const toggleSize = (size: string) => {
    const [stdKey] = getMatrixFields()
    const current = (formData[stdKey] as string[]) || []
    const isRemoving = current.includes(size)
    const newFormData = { ...formData, [stdKey]: isRemoving ? current.filter(s => s !== size) : [...current, size] }
    setFormData(newFormData)
    if (isRemoving) cleanupOrphanedInputs(newFormData)
  }

  const togglePurity = (p: string) => {
    const current = formData.standardPurities || []
    const isRemoving = current.includes(p)
    const newFormData = { ...formData, standardPurities: isRemoving ? current.filter(x => x !== p) : [...current, p] }
    setFormData(newFormData)
    if (isRemoving) cleanupOrphanedInputs(newFormData)
  }

  const addCustomSize = () => {
    const v = customSizeInput.trim()
    if (!v) return
    if (!/^\d+(\.\d+)?$/.test(v) && !hasStonesCategory(formData.category)) {
      alert('Only numeric values are allowed for custom sizes/weights.')
      return
    }
    const [, cstKey] = getMatrixFields()
    const current = (formData[cstKey] as string[]) || []
    if (!current.includes(v)) {
      setFormData({ ...formData, [cstKey]: [...current, v] })
    }
    setCustomSizeInput('')
  }

  const removeCustomSize = (s: string) => {
    const [, cstKey] = getMatrixFields()
    const newFormData = { ...formData, [cstKey]: ((formData[cstKey] as string[]) || []).filter(x => x !== s) }
    setFormData(newFormData)
    cleanupOrphanedInputs(newFormData)
  }

  const addCustomPurity = () => {
    const val = customPurityInput.trim()
    if (!val) return
    if (!/^\d+(\.\d)?$/.test(val)) {
      alert('Only numeric values with up to one decimal point are allowed for purity.')
      return
    }
    const newCustoms = [...(formData.customPurities || []), val]
    setFormData({ ...formData, customPurities: Array.from(new Set(newCustoms)) })
    setCustomPurityInput('')
  }

  const removeCustomPurity = (p: string) => {
    const newFormData = { ...formData, customPurities: (formData.customPurities || []).filter(x => x !== p) }
    setFormData(newFormData)
    cleanupOrphanedInputs(newFormData)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.id) { alert("ID is required!"); return }
    const docId = editingId || formData.id

    try {
      if (!editingId) {
        if (items.some(i => i.id === docId)) {
          alert(`A product with the ID "${docId}" already exists. Please choose a unique ID.`)
          return
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...payload } = formData

      let totalSize = payload.imageFile ? payload.imageFile.length : 0
      if (payload.additionalImages) {
        payload.additionalImages.forEach(img => { totalSize += img.length })
      }
      if (totalSize > 900000) {
        alert("Total image size exceeds the Firestore limit. Please remove or compress images before saving.")
        return
      }

      if (!formData.hasVariants) {
        payload.standardSizes = []; payload.customSizes = []; payload.standardWeights = []; payload.customWeights = []; payload.standardStones = []; payload.customStones = []
        payload.standardPurities = []; payload.customPurities = []
        payload.variantSkus = {}
        payload.variantImages = {}
      } else {
        const combos = buildVariantCombos(formData)
        if (combos.length === 0) {
          alert('Select the variant options (sizes/purities, stones, or weights) before saving.')
          return
        }

        const isBullion = !!formData.category?.includes('Bullion')
        const variantSkus: Record<string, VariantDetail> = {}
        const seenSkus = new Set<string>()

        for (const combo of combos) {
          const sku = (variantSkuInputs[combo.key] || '').trim()
          if (!sku) { alert(`Variant SKU for "${combo.label}" is required.`); return }
          if (seenSkus.has(sku)) { alert(`Duplicate variant SKU "${sku}". Each variant must have a unique SKU.`); return }
          seenSkus.add(sku)

          const detail: VariantDetail = { ...combo.attrs }
          if (!isBullion) {
            const w = numericFilter(variantWeightInputs[combo.key] || '').trim()
            if (!w) { alert(`Approx weight for "${combo.label}" is required.`); return }
            detail.weight = w
          }
          variantSkus[sku] = detail
        }

        payload.variantSkus = variantSkus
        
        const cleanedImages: Record<string, string[]> = {}
        for (const [key, imgs] of Object.entries(variantImageInputs)) {
          const valid = imgs.filter(Boolean)
          if (valid.length > 0) cleanedImages[key] = valid
        }
        payload.variantImages = cleanedImages
      }

      payload.searchTerms = buildSearchTerms(payload)

      await saveInventoryItem(docId, payload)

      if (editingId) {
        setItems(items.map(i => i.id === editingId ? { id: docId, ...payload } as InventoryItem : i))
      } else {
        setItems([...items, { id: docId, ...payload } as InventoryItem])
      }
      handleCancel()
    } catch (err) {
      console.error("Error saving product:", err)
      alert("Failed to save product. Please check your connection and permissions.")
    }
  }

  return {
    state: {
      items,
      categories,
      loading,
      isFormOpen,
      editingId,
      deleteId,
      formData,
      customSizeInput,
      customPurityInput,
      variantSkuInputs,
      variantWeightInputs,
      variantImageInputs,
      categoryOpen,
      categoryFocusedIndex,
      combos
    },
    actions: {
      setIsFormOpen,
      setDeleteId,
      setFormData,
      setCustomSizeInput,
      setCustomPurityInput,
      setVariantSkuInputs,
      setVariantWeightInputs,
      setVariantImageInputs,
      setCategoryOpen,
      setCategoryFocusedIndex,
      cleanupOrphanedInputs,
      executeDelete,
      handleEdit,
      handleCancel,
      handleSave,
      toggleSize,
      togglePurity,
      addCustomSize,
      removeCustomSize,
      addCustomPurity,
      removeCustomPurity,
      numericFilter
    }
  }
}
