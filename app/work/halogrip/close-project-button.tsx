"use client";

import CloseProjectButton from "../../components/CloseProjectButton";

/**
 * HALOGRIP's close pill — the shared control (see app/components/CloseProjectButton.tsx),
 * pointed at this page's dark surfaces: .dark-section, plus .overview, which reads dark but
 * doesn't carry that class since its own background is an absolutely positioned photo layer.
 */
export default function HalogripCloseProjectButton() {
  return <CloseProjectButton className="close-project" darkSelector=".dark-section, .overview" />;
}
