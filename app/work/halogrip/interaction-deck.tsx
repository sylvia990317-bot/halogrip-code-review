"use client";

import { useState } from "react";

/** The source photo already leans about 22 degrees clockwise; NEUTRAL_ANGLE
 * corrects that baseline. Brake returns to upright, forward tilts clockwise and
 * reverse tilts counter-clockwise, matching the direction in intro-motion.ts.
 * Forward intentionally uses a stronger 30-degree illustration angle for legibility.
 * These are image poses, not measurements of physical input travel. */
const NEUTRAL_ANGLE = -22;
const TILT_FORWARD = 30;
// Illustration angles describe the image pose, not measured physical input travel.
const TILT_BRAKE = 0;
const TILT_REVERSE = -22.79;
const states = [
  { title: "FORWARD", action: "PUSH / ACCELERATE", angle: NEUTRAL_ANGLE + TILT_FORWARD, description: "Tilt forward to move the vehicle ahead." },
  { title: "BRAKE", action: "RELEASE / DECELERATE", angle: NEUTRAL_ANGLE + TILT_BRAKE, description: "Release the forward tilt to return to neutral and slow down." },
  { title: "REVERSE", action: "PULL BACK", angle: NEUTRAL_ANGLE + TILT_REVERSE, description: "Tilt back past neutral to reverse at low speed." },
];

export default function InteractionDeck() {
  const [selected, setSelected] = useState(0);
  const active = states[selected];

  return (
    <div className="interaction-control">
      <div className="interaction-demo" aria-live="polite">
        <div className="interaction-stage">
          <img
            src="/media/halogrip/other/product-side.webp"
            alt={active.description}
            style={{ transform: `rotate(${active.angle}deg)` }}
          />
        </div>
      </div>
      <div className="interaction-panel">
        <span className="interaction-description" aria-live="polite">{active.description}</span>
        <div className="interaction-buttons" aria-label="Explore steering control states">
          {states.map((state, index) => (
            <button
              className={`dir-${state.title.toLowerCase()}${index === selected ? " is-active" : ""}`}
              key={state.title}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={index === selected}
            >
              <span>0{index + 1}</span>
              <strong>{state.title}</strong>
              <small>{state.action}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
