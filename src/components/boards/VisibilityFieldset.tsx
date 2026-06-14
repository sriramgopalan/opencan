"use client";

interface Props {
  isPublic: boolean;
  isListed: boolean;
  onPublicChange: (value: boolean) => void;
  onListedChange: (value: boolean) => void;
  publicLabel?: string;
  listedLabel?: string;
}

export function VisibilityFieldset({
  isPublic,
  isListed,
  onPublicChange,
  onListedChange,
  publicLabel = "Public",
  listedLabel = "Listed on board index",
}: Props) {
  return (
    <fieldset>
      <legend>Visibility</legend>
      <label>
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => {
            const checked = e.target.checked;
            onPublicChange(checked);
            if (!checked) onListedChange(false);
          }}
        />
        {publicLabel}
      </label>
      <label>
        <input
          type="checkbox"
          checked={isListed}
          disabled={!isPublic}
          onChange={(e) => onListedChange(e.target.checked)}
        />
        {listedLabel}
      </label>
    </fieldset>
  );
}
