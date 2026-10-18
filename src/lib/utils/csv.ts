/**
 * CSV Utilities with Formula Injection Protection and Blob-based Downloads
 * 
 * Addresses:
 * 1. Data URLs truncate CSV downloads at '#' characters because '#' is parsed as a URL fragment identifier.
 *    Building the file as a Blob with URL.createObjectURL fixes this.
 * 2. Formula injection (CSV Injection / DDE): Cells starting with '=', '+', '-', '@'
 *    can be executed as dynamic formulas in Excel/Google Sheets. Risky cells are prefixed with an apostrophe (').
 */

/**
 * Escapes a cell value for safe inclusion in a CSV.
 * - Prefixes risky formula cells (starting with '=', '+', '-', '@', '\t', '\r') with an apostrophe (')
 * - Escapes embedded double-quotes by doubling them ("" -> """")
 * - Encloses strings in quotes
 */
export function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""'
  }

  // Pure numbers are safe from formula execution
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '""'
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  let str = String(value)

  // Formula injection check
  // Leading whitespace before formula trigger characters also triggers formula evaluation in Excel
  const trimmed = str.trimStart()
  const firstChar = trimmed.charAt(0)

  // Risky formula prefixes: '=', '+', '-', '@'
  if (firstChar === '=' || firstChar === '@') {
    str = `'${str}`
  } else if (firstChar === '+' || firstChar === '-') {
    // If it's a signed numeric string like "-42.50" or "+100", it is safe as a number.
    // If it's something like "-cmd|..." or "+SUM(...)" or "+A1", prefix with apostrophe.
    const numericCheck = Number(trimmed)
    if (isNaN(numericCheck)) {
      str = `'${str}`
    }
  } else if (firstChar === '\t' || firstChar === '\r') {
    str = `'${str}`
  }

  // Double quotes inside a CSV cell must be escaped with an additional double quote
  const escaped = str.replace(/"/g, '""')
  return `"${escaped}"`
}

/**
 * Builds CSV content string from an array of headers and rows.
 */
export function buildCSVContent(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map((h) => escapeCSVCell(h)).join(',')
  const rowLines = rows.map((row) => row.map((cell) => escapeCSVCell(cell)).join(','))
  return [headerLine, ...rowLines].join('\r\n')
}

/**
 * Initiates a browser file download using a Blob and Object URL.
 * Automatically prepends the UTF-8 Byte Order Mark (\uFEFF) so Excel respects UTF-8 encoding.
 */
export function downloadCSV(filename: string, headers: string[], rows: unknown[][]): void {
  const csvContent = buildCSVContent(headers, rows)

  // \uFEFF is UTF-8 BOM, ensuring correct rendering of symbols (e.g. ₹, #, accents) in MS Excel
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const finalFilename = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`

  const link = document.createElement('a')
  link.href = url
  link.download = finalFilename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  // Clean up DOM and revoke object URL
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 1000)
}
