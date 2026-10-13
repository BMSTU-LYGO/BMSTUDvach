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
