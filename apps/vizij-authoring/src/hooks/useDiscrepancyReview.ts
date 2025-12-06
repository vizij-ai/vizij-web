import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DiscrepancyResolutionResult,
  DiscrepancyReviewState,
} from "../types/discrepancy";

export type DiscrepancyReviewPayload = Omit<
  DiscrepancyReviewState,
  "id" | "createdAt"
>;

export interface DiscrepancyReviewApi {
  discrepancyReview: DiscrepancyReviewState | null;
  openDiscrepancyReview: (
    payload: DiscrepancyReviewPayload,
  ) => Promise<DiscrepancyResolutionResult>;
  resolveDiscrepancyReview: (result: DiscrepancyResolutionResult) => void;
}

export function useDiscrepancyReview(): DiscrepancyReviewApi {
  const [discrepancyReview, setDiscrepancyReview] =
    useState<DiscrepancyReviewState | null>(null);
  const resolverRef = useRef<
    ((result: DiscrepancyResolutionResult) => void) | null
  >(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        // eslint-disable-next-line no-console
        console.debug("[discrepancy] unmount resolution – auto-reject");
        resolverRef.current({ accepted: false });
        resolverRef.current = null;
      }
    };
  }, []);

  const resolveDiscrepancyReview = useCallback(
    (result: DiscrepancyResolutionResult) => {
      // eslint-disable-next-line no-console
      console.debug("[discrepancy] resolve", result);
      const resolver = resolverRef.current;
      resolverRef.current = null;
      setDiscrepancyReview(null);
      if (resolver) {
        resolver(result);
      }
    },
    [],
  );

  const openDiscrepancyReview = useCallback(
    async (payload: DiscrepancyReviewPayload) =>
      await new Promise<DiscrepancyResolutionResult>((resolve) => {
        // eslint-disable-next-line no-console
        console.debug("[discrepancy] open", payload);
        resolverRef.current = resolve;
        sequenceRef.current += 1;
        setDiscrepancyReview({
          id: `review-${Date.now()}-${sequenceRef.current}`,
          createdAt: new Date().toISOString(),
          ...payload,
        });
      }),
    [],
  );

  return {
    discrepancyReview,
    openDiscrepancyReview,
    resolveDiscrepancyReview,
  };
}
