export interface Board {
  id: number
  slug: string
  name: string
  description: string
  is_active: boolean
  order: number
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: number
  url: string
  mime_type: string
  size: number
  width: number | null
  height: number | null
  original_name: string
  created_at: string
}

export interface Post {
  id: number
  thread: number
  body: string
  is_op: boolean
  created_at: string
  updated_at: string
  author: string
  attachments: Attachment[]
}

export interface ThreadSummary {
  id: number
  board: string
  title: string
  is_pinned: boolean
  is_locked: boolean
  created_at: string
  updated_at: string
  bumped_at: string
  reply_count: number
}

export interface ThreadDetail extends ThreadSummary {
  posts: Post[]
}

export interface Paginated<T> {
  count: number
  page: number
  pages: number
  page_size: number
  results: T[]
}

export interface ApiError {
  detail?: string
  errors?: Record<string, string[]>
}

export type ReportReason =
  | 'spam'
  | 'abuse'
  | 'illegal'
  | 'offtopic'
  | 'other'

export interface NewThreadInput {
  title: string
  body: string
  attachments?: File[]
}

export interface NewPostInput {
  body: string
  attachments?: File[]
}

export interface NewReportInput {
  reason: ReportReason
  comment?: string
}