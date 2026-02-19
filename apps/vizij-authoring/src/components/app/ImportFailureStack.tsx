import { Button } from "../ui";

export interface ImportFailureItem {
  id: string;
  title: string;
  message: string;
  dismissLabel?: string;
  retryLabel?: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

interface ImportFailureStackProps {
  failures: ImportFailureItem[];
}

export function ImportFailureStack({ failures }: ImportFailureStackProps) {
  if (failures.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
      {failures.map((failure) => (
        <div
          key={failure.id}
          role="alert"
          className="pointer-events-auto rounded-md border border-red-800/70 bg-red-950/90 px-3 py-2 text-red-100 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">{failure.title}</p>
              <p className="mt-0.5 text-xs text-red-200/90">
                {failure.message}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {failure.onRetry ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] hover:bg-red-500/20 text-red-100"
                  onClick={failure.onRetry}
                >
                  {failure.retryLabel ?? "Retry"}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] hover:bg-red-500/20 text-red-200"
                onClick={failure.onDismiss}
              >
                {failure.dismissLabel ?? "Dismiss"}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
