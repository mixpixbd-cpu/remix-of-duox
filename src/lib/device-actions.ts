/** Only commands implemented by DeviceAgent may be sent by the web app. */
export function canRunDeviceAction(kind: string): boolean {
  return ["device_status", "live_location", "siren", "force_logout"].includes(kind);
}

export function deviceActionLabel(kind: string, bn: boolean): string {
  if (!canRunDeviceAction(kind)) return bn ? "এখন উপলব্ধ নয়" : "Unavailable";
  if (kind === "siren") return bn ? "বাজান" : "Ring";
  if (kind === "live_location") return bn ? "আপডেট করুন" : "Refresh";
  if (kind === "force_logout") return bn ? "সেশন বন্ধ করুন" : "End session";
  return bn ? "সিঙ্ক করুন" : "Sync";
}

export function deviceActionUnavailable(bn: boolean): string {
  return bn
    ? "এই সুবিধা এখন চালু নেই। ফোনের উপযুক্ত অ্যাপ ও স্পষ্ট অনুমতি প্রয়োজন।"
    : "This feature is not available. A compatible phone app and explicit permission are required.";
}