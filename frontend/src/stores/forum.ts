import { defineStore } from 'pinia'

import { listBoards } from '@/api/boards'
import {
  createPost as apiCreatePost,
  createReport as apiCreateReport,
} from '@/api/posts'
import {
  createThread as apiCreateThread,
  getThread,
  listThreads,
} from '@/api/threads'
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
        this.boards.boards = await listBoards()
      } catch (err) {
        this.boards.error = messageOf(err)
      } finally {
        this.boards.loading = false
      }
    },

    async fetchThreads(boardSlug: string) {
      this.threadList.loading = true
      this.threadList.error = null
      try {
        const page = await listThreads(boardSlug)
        this.threadList.threads = page.results
      } catch (err) {
        this.threadList.error = messageOf(err)
      } finally {
        this.threadList.loading = false
      }
    },

    async fetchThread(threadId: number) {
      this.thread.loading = true
      this.thread.error = null
      try {
        this.thread.thread = await getThread(threadId)
      } catch (err) {
        this.thread.error = messageOf(err)
      } finally {
        this.thread.loading = false
      }
    },

    async createThread(boardSlug: string, input: NewThreadInput): Promise<ThreadDetail> {
      const thread = await apiCreateThread(boardSlug, input)
      this.thread.thread = thread
      return thread
    },

    async createPost(threadId: number, input: NewPostInput): Promise<Post> {
      return apiCreatePost(threadId, input)
    },

    async createReport(
      postId: number,
      input: NewReportInput,
    ): Promise<{ detail: string; id: number }> {
      return apiCreateReport(postId, input)
    },
  },
})

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Неизвестная ошибка'
}