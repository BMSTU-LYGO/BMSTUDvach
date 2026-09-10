import type { ApiError } from '@/types'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export class ApiRequestError extends Error {
  status: number
  errors: Record<string, string[]>

  constructor(
    status: number,
    message: string,
    errors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.errors = errors
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  const isForm = options.body instanceof FormData

  if (!isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })

  const contentType = response.headers.get('Content-Type') ?? ''
  const text = await response.text()
  let data: unknown = null
  if (contentType.includes('application/json') && text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiError>
    throw new ApiRequestError(
      response.status,
      body.detail ?? 'Request failed',
      body.errors ?? {},
    )
  }

  return data as T
}

export function toFormData(input: Record<string, unknown>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof File) form.append(key, item)
      }
    } else if (value !== undefined && value !== null) {
      form.append(key, String(value))
    }
  }
  return form
}