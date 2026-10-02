export type DigestDestination = 'DASHBOARD' | 'HOLDINGS' | 'JOURNAL'
export type DigestState = {
  status: 'DISABLED' | 'HIDDEN' | 'IDLE' | 'GENERATING' | 'READY' | 'FAILED' | 'LIMITED'
  day: string
  digest: {
    id: string
    capturedAt: string
    generatedAt: string
    content: {
      news: string
      reflection: string
      questions: { text: string; destination: DigestDestination }[]
      sources: { headline: string; summary: string; publishedOn: string | null; url: string }[]
      newsStatus: 'FETCHING' | 'READY' | 'EMPTY' | 'UNAVAILABLE' | 'DISABLED'
      demoTemplate: boolean
    }
  } | null
}
