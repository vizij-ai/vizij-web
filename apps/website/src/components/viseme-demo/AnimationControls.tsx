interface AnimationControlsProps {
  vizemeOffset: number;
  onVizemeOffsetChange: (offset: number) => void;
  transitionType: string;
  onTransitionTypeChange: (type: string) => void;
}

export const AnimationControls = ({
  vizemeOffset,
  onVizemeOffsetChange,
  transitionType,
  onTransitionTypeChange,
}: AnimationControlsProps) => {
  return (
    <div className="flex justify-center items-center gap-8 py-4">
      <div className="pt-2 mt-2">
        <label>Vizeme Offset</label>
        <input
          type="range"
          min="-800"
          max="0"
          value={vizemeOffset}
          onChange={(e) => onVizemeOffsetChange(parseInt(e.target.value))}
          className="m-2"
        />
        <span>{vizemeOffset}ms</span>
      </div>
      <div className="pt-2 mt-2">
        <label>Transition Type</label>
        <select
          className="bg-white text-black p-2 mx-2"
          value={transitionType}
          onChange={(e) => onTransitionTypeChange(e.target.value)}
        >
          <option value="linear">Linear</option>
          <option value="bezier">Bezier</option>
          <option value="step">Step</option>
          <option value="cubic">Cubic</option>
          <option value="spring">Spring</option>
          <option value="ease_in_out">EaseInOut</option>
        </select>
      </div>
    </div>
  );
};
