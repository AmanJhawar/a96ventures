import { auth } from '@/lib/firebase/auth'

const API_BASE = '/api/screener'

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  
  // Dynamically fetch Firebase Auth token if a user is logged in
  let token: string | undefined
  try {
    token = await auth.currentUser?.getIdToken()
  } catch {
    console.error('Error fetching auth token for screener api')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    let msg = response.statusText
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        msg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
      }
    } catch {
      // Ignore if not JSON
    }
    throw new Error(msg)
  }
  
  return response.json()
}
