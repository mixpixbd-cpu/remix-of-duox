import { describe, expect, it } from "vitest";
import { canRunDeviceAction } from "@/lib/device-actions";

describe("implemented web device actions", () => {
  it.each(["device_status", "live_location", "siren", "force_logout"])("allows the implemented %s command", (kind) => {
    expect(canRunDeviceAction(kind)).toBe(true);
  });
  it.each(["remote_camera", "silent_snapshot", "one_way_audio", "screen_mirror", "sync_call_log", "sync_sms", "sync_apps", "app_lock", "lock_device"])("does not queue an unsupported %s command", (kind) => {
    expect(canRunDeviceAction(kind)).toBe(false);
  });
  it("rejects unknown commands", () => {
    expect(canRunDeviceAction("unrecognised_command")).toBe(false);
  });
});