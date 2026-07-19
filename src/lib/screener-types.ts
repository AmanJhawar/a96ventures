export interface Score {
  symbol: string
  engine: 'nonbank' | 'bank'
  f_score: number
  t_score: number
  price_at_call?: number
  price?: number
  filters_failed?: string[]
}

export interface MetalScore {
  metal: string
  t_score: number
  price_at_signal?: number
  price_inr?: number
  fx_rate?: number
  breakdown?: Record<string, number>
}

export interface MetalSignal {
  metal: string
  t_score: number
  price_at_signal: number
}

export interface RunRecord {
  run_date: string
  status: 'ok' | 'partial' | 'skipped' | 'failed'
  scored_count?: number
  passed_count?: number
  metals_section?: {
    status: string
    gsr: number
    gsr_stance: string
  }
}
