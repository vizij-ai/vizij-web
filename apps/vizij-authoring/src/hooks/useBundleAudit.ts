import { useCallback, useEffect, useState } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import {
  auditBundleGraphs,
  type BundleGraphAuditEntry,
} from "../utils/bundleAudit";

export interface UseBundleAuditResult {
  bundleAudit: BundleGraphAuditEntry[] | null;
  bundleAuditError: string | null;
  bundleAuditStatus: "idle" | "running";
  refreshBundleAudit: () => void;
}

export function useBundleAudit(
  bundle: VizijBundleExtension | null,
  validOutputTargets: Set<string>,
): UseBundleAuditResult {
  const [bundleAudit, setBundleAudit] = useState<
    BundleGraphAuditEntry[] | null
  >(null);
  const [bundleAuditError, setBundleAuditError] = useState<string | null>(null);
  const [bundleAuditStatus, setBundleAuditStatus] = useState<
    "idle" | "running"
  >("idle");

  const refreshBundleAudit = useCallback(async () => {
    if (!bundle?.graphs?.length) {
      setBundleAudit(null);
      setBundleAuditError(null);
      setBundleAuditStatus("idle");
      return;
    }

    setBundleAuditStatus("running");
    try {
      const result = await auditBundleGraphs(bundle, { validOutputTargets });
      setBundleAudit(result);
      setBundleAuditError(null);
    } catch (error) {
      setBundleAuditError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBundleAuditStatus("idle");
    }
  }, [bundle, validOutputTargets]);

  useEffect(() => {
    void refreshBundleAudit();
  }, [refreshBundleAudit]);

  return {
    bundleAudit,
    bundleAuditError,
    bundleAuditStatus,
    refreshBundleAudit,
  };
}
