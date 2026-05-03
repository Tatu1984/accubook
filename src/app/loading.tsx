export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
    </div>
  );
}
