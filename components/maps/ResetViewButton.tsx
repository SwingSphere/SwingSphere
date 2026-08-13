import React from "react";

type ResetViewButtonProps = {
  onReset: () => void;
};

const ResetViewButton: React.FC<ResetViewButtonProps> = ({ onReset }) => {
  return (
    <button
      type="button"
      onClick={onReset}
      className="absolute top-4 left-4 z-20 rounded-md bg-black/60 border border-red-600 text-white px-3 py-1 text-xs font-bold hover:bg-red-600 hover:text-white transition"
    >
      Reset View
    </button>
  );
};

export default ResetViewButton;

