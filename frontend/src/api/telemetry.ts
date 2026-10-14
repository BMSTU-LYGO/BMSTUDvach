import { request } from './client'

export interface TelemetryRecent {
  posts: number
  threads: number
}

export interface TelemetryBusiestBoard {
  slug: string
  name: string
  posts: number
}

export interface Telemetry {
  boards: number
  threads: number
  posts: number
  attachments: number
  last_24h: TelemetryRecent
  busiest_board: TelemetryBusiestBoard | null
  generated_at: string
}

/** Телеметрия сети — сводка видимых данных для рейка на главной. */
export function getTelemetry(): Promise<Telemetry> {
  return request<Telemetry>('/telemetry/')
}

/** Одна точка суточной серии активности. */
export interface TelemetryActivityPoint {
  date: string
  posts: number
  threads: number
}

/** Суточная серия активности за окно `days` (1..30). */
export interface TelemetryActivity {
  days: number
  points: TelemetryActivityPoint[]
}

/** Серия активности по дням для графика на странице статистики. */
export function getTelemetryActivity(days = 7): Promise<TelemetryActivity> {
  return request<TelemetryActivity>(`/telemetry/activity/?days=${days}`)
}
