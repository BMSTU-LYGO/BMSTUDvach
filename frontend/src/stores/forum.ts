import { defineStore } from 'pinia'
import type {
  Board,
  NewPostInput,
  NewReportInput,
  NewThreadInput,
  Post,
  ThreadDetail,
  ThreadSummary,
} from '@/types'

interface LoadingErrorState {
  loading: boolean
  error: string | null
}

export interface BoardState extends LoadingErrorState {
  boards: Board[]
}

export interface ThreadListState extends LoadingErrorState {
  threads: ThreadSummary[]
}

export interface ThreadState extends LoadingErrorState {
  thread: ThreadDetail | null
}

const STUB_BOARDS: Board[] = [
  {
    id: 1,
    slug: 'b',
    name: 'Разное',
    description: 'Обо всём понемногу',
    is_active: true,
    order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    slug: 'study',
    name: 'Учёба',
    description: 'Обсуждение учёбы',
    is_active: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export const useForumStore = defineStore('forum', {
  state: () => ({
    boards: {
      boards: [] as Board[],
      loading: false,
      error: null as string | null,
    } as BoardState,
    threadList: {
      threads: [] as ThreadSummary[],
      loading: false,
      error: null as string | null,
    } as ThreadListState,
    thread: {
      thread: null as ThreadDetail | null,
      loading: false,
      error: null as string | null,
    } as ThreadState,
  }),

  getters: {
    boardsCount: (state) => state.boards.boards.length,
  },

  actions: {
    async fetchBoards() {
      this.boards.loading = true
      this.boards.error = null
      try {
        this.boards.boards = await new Promise((resolve) =>
          setTimeout(() => resolve(STUB_BOARDS), 200),
        )
      } catch (err) {
        this.boards.error = messageOf(err)
      } finally {
        this.boards.loading = false
      }
    },

    async fetchThreads(_boardSlug: string) {
      this.threadList.loading = true
      this.threadList.error = null
      try {
        this.threadList.threads = await new Promise((resolve) =>
          setTimeout(() => resolve([]), 200),
        )
      } catch (err) {
        this.threadList.error = messageOf(err)
      } finally {
        this.threadList.loading = false
      }
    },

    async fetchThread(_threadId: number) {
      this.thread.loading = true
      this.thread.error = null
      try {
        this.thread.thread = await new Promise((resolve) =>
          setTimeout(() => resolve(null), 200),
        )
      } catch (err) {
        this.thread.error = messageOf(err)
      } finally {
        this.thread.loading = false
      }
    },

    async createThread(_boardSlug: string, _input: NewThreadInput) {
      return null as unknown as ThreadDetail
    },

    async createPost(_threadId: number, _input: NewPostInput) {
      return null as unknown as Post
    },

    async createReport(_postId: number, _input: NewReportInput) {
      return { detail: 'Report accepted (stub)', id: 0 }
    },
  },
})

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Неизвестная ошибка'
}