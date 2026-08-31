import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileSummary } from "@vizij/runtime";
import { Badge, Button, Modal, PanelSearch } from "../ui";
import { EmptyState } from "../ui/EmptyState";

interface ProfileImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** The profiles the registry offers. */
  available: ProfileSummary[];
  /** Ids the open face already declares — shown as such, and re-importable. */
  declaredIds: string[];
  /** Declare a registry profile on the face. */
  onImport: (id: string) => void;
  /** Declare a profile from a JSON file instead. */
  onImportFile: () => void;
}

/**
 * Pick a profile to declare on the open face.
 *
 * A profile is a set of paths and their types, and the registry is expected to
 * carry tens of them, so this is a searchable list rather than a menu: search
 * covers the id, title and description, because someone looking for a face
 * vocabulary is as likely to type "viseme" or "ROS" as the profile's name.
 *
 * A profile already declared stays listed and importable — re-importing is how
 * you pick up a newer version of the same id.
 */
export function ProfileImportDialog({
  open,
  onClose,
  available,
  declaredIds,
  onImport,
  onImportFile,
}: ProfileImportDialogProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Reopening starts from the full list, and the search takes focus so the
  // dialog is usable without reaching for the mouse.
  useEffect(() => {
    if (open) {
      setQuery("");
      const id = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return available;
    }
    return available.filter((profile) =>
      [profile.id, profile.title, profile.description]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [available, query]);

  return (
    <Modal open={open} onClose={onClose} title="Import Profile" maxWidth="2xl">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-secondary">
          A profile names and types the paths a face is driven through.
          Declaring one records it on the face, so the vocabulary travels with
          the export.
        </p>

        <PanelSearch
          ref={searchRef}
          value={query}
          onChange={setQuery}
          placeholder="Search profiles..."
        />

        <div
          className="flex max-h-96 flex-col gap-1 overflow-y-auto"
          data-testid="profile-import-list"
        >
          {matches.length === 0 ? (
            <EmptyState
              title={
                available.length === 0
                  ? "No profiles available"
                  : "No profiles match"
              }
              description={
                available.length === 0
                  ? "The registry could not be read. You can still import a profile from a JSON file."
                  : "Try a different search, or import a profile from a JSON file."
              }
            />
          ) : (
            matches.map((profile) => {
              const declared = declaredIds.includes(profile.id);
              return (
                <div
                  key={profile.id}
                  className="flex items-start gap-3 rounded border border-border-default p-3 hover:bg-bg-hover"
                  data-testid={`profile-import-row-${profile.id}`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {profile.title}
                      </span>
                      <Badge>{profile.version}</Badge>
                      <span className="text-xs text-text-secondary">
                        {profile.keys} paths
                      </span>
                      {declared ? <Badge>declared</Badge> : null}
                    </div>
                    <span className="text-xs text-text-secondary">
                      {profile.description}
                    </span>
                  </div>
                  <Button
                    onClick={() => {
                      onImport(profile.id);
                      onClose();
                    }}
                    data-testid={`profile-import-${profile.id}`}
                  >
                    {declared ? "Re-import" : "Import"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-default pt-3">
          <Button
            onClick={() => {
              onImportFile();
              onClose();
            }}
            data-testid="profile-import-from-file"
          >
            Import from JSON file...
          </Button>
          <Button onClick={onClose} data-testid="profile-import-close">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
