import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "../ui";

interface ObjectHeaderProps {
  name: string;
  typeLabel: string;
  id: string;
  onNameChange: (name: string) => void;
}

export function ObjectHeader({
  name,
  typeLabel,
  id,
  onNameChange,
}: ObjectHeaderProps) {
  const [draftName, setDraftName] = useState(name);

  useEffect(() => {
    setDraftName(name);
  }, [id, name]);

  const commitName = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      setDraftName(name);
      return;
    }
    if (trimmed === name) {
      return;
    }
    onNameChange(trimmed);
  }, [draftName, name, onNameChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitName();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDraftName(name);
        event.currentTarget.blur();
      }
    },
    [commitName, name],
  );

  return (
    <header className="sidebar__panel-header">
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          className="sidebar__panel-title-input"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={handleKeyDown}
          placeholder="Object Name"
        />
        <p className="sidebar__panel-description" title={id}>
          {id}
        </p>
      </div>
      <Badge>{typeLabel}</Badge>
    </header>
  );
}
