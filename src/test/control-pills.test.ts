import { describe, expect, it } from "vitest";
import { activeControls } from "@/components/fp/ControlPills";

describe("owner control pills", () => {
  it("shows nothing when no control is on", () => {
    expect(activeControls({ chat_paused: false, disappearing_seconds: 0, settings: {} }, false)).toEqual([]);
  });
  it("shows only switched-on controls", () => {
    expect(activeControls({ chat_paused: true, disappearing_seconds: 3600, save_to_gallery_blocked: true, settings: { g_stealth: true } }, true))
      .toEqual(["pause", "timer", "nosave", "stealth", "mute"]);
  });
});
