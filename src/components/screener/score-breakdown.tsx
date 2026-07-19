import { CheckCircle2, XCircle } from 'lucide-react'

const KEY_LABELS: Record<string, string> = {
  // Non-Bank
  'net_income': 'Positive Net Income (ROA > 0)',
  'roa_delta': 'Improving ROA (YoY)',
  'ocf_positive': 'Positive Operating Cash Flow',
  'accrual': 'High Quality Earnings (OCF > Net Income)',
  'debt_asset_delta': 'Decreasing Leverage (Debt/Assets YoY)',
  'current_ratio_delta': 'Improving Liquidity (Current Ratio YoY)',
  'no_dilution': 'No Share Dilution',
  'gross_margin_delta': 'Expanding Gross Margin (YoY)',
  'asset_turnover_delta': 'Improving Asset Turnover (YoY)',
  'ev_ebit_value': 'Attractive Value (EV/EBIT < 5Y Median)',

  // Bank
  'gross_npa_down': 'Decreasing Gross NPA',
  'pcr_up': 'Improving Provision Coverage',
  'roa_positive': 'Positive ROA',
  'roa_up': 'Improving ROA (YoY)',
  'nim_up': 'Expanding NIM (YoY)',
  'cost_income_down': 'Improving Efficiency (Cost/Income down)',
  'pb_value': 'Attractive Value (P/B < 5Y Median)',
  'casa_up': 'Improving CASA Ratio',

  // Technical (Stock)
  'rsi': 'RSI Condition',
  'kst': 'KST Momentum',
  'ma': 'Moving Averages Condition',
  'volume': 'Volume Accumulation',

  // Technical (Metals)
  'bollinger': 'Bollinger Band Position',
  'dip_vs_50': 'Pullback vs 50 SMA',
}

export function ScoreBreakdown({ breakdown, title }: { breakdown: Record<string, number>, title: string }) {
  if (!breakdown || Object.keys(breakdown).length === 0) return null

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(breakdown).map(([key, score]) => {
          const label = KEY_LABELS[key] || key.replace(/_/g, ' ')
          const passed = score > 0
          
          return (
            <div key={key} className={`flex items-center gap-3 p-3 rounded-lg border ${passed ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50/50 border-gray-100'}`}>
              {passed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-300 shrink-0" />
              )}
              <div className="flex-1 flex justify-between items-center">
                <span className={`text-sm font-medium ${passed ? 'text-gray-900' : 'text-gray-500'}`}>
                  {label}
                </span>
                <span className={`text-sm font-bold ${passed ? 'text-emerald-600' : 'text-gray-400'}`}>
                  +{score}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
