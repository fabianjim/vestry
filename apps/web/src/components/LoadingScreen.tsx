export default function LoadingScreen({ message }: { message: string }) {
  return (
    <div role="status" className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
      <div aria-hidden="true" className="size-8 rounded-full border-2 border-border border-t-primary motion-safe:animate-spin" />
      <p>{message}</p>
    </div>
  )
}
