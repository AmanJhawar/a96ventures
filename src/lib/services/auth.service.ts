/**
 * Syncs user claims with server session.
 */
export async function syncAuthClaims(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })
    return res.ok
  } catch (err) {
    console.warn('Sync claims warning:', err)
    return false
  }
}
