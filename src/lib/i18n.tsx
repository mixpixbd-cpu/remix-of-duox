import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const dict = {
  en: {
    tagline: "Private • One-to-One",
    loading: "Getting things ready…",
    startupError: "Couldn't start. Check your internet and try again.",
    retry: "Try again",
    signIn: "Sign in",
    signUp: "Create account",
    email: "Email",
    password: "Password",
    name: "Your name",
    haveAccount: "Already have an account? Sign in",
    noAccount: "New here? Create a partner account",
    ownerSignup: "Create an owner account instead",
    checkEmail: "Check your email to confirm your account, then sign in.",
    chats: "Chats",
    partners: "Partners",
    profile: "Profile",
    online: "Online",
    offline: "Offline",
    noPartners: "No partners yet. Add one with their DuoX code.",
    noOwner: "You're not connected yet. Share your code with your owner.",
    yourCode: "Your DuoX code",
    addPartner: "Add partner",
    partnerCode: "Partner's code",
    add: "Add",
    remove: "Remove",
    removeConfirm: "Remove this partner? Their chat will be deleted.",
    added: "Partner added",
    removed: "Partner removed",
    owner: "Owner",
    partner: "Partner",
    role: "Role",
    language: "Language",
    logout: "Log out",
    save: "Save",
    saved: "Saved",
    typeMessage: "Type a message",
    noMessages: "Say hello 👋",
    sent: "Sent",
    download: "Download",
    open: "Open",
    callsSoon: "Calls are coming in the next update.",
    adFree: "100% ad-free",
    since: "Partner since",
  },
  bn: {
    tagline: "ব্যক্তিগত • এক-এর-সাথে-এক",
    loading: "সব প্রস্তুত করা হচ্ছে…",
    startupError: "চালু করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা",
    signIn: "লগইন",
    signUp: "অ্যাকাউন্ট খুলুন",
    email: "ইমেইল",
    password: "পাসওয়ার্ড",
    name: "আপনার নাম",
    haveAccount: "অ্যাকাউন্ট আছে? লগইন করুন",
    noAccount: "নতুন? পার্টনার অ্যাকাউন্ট খুলুন",
    ownerSignup: "বরং ওনার অ্যাকাউন্ট খুলুন",
    checkEmail: "ইমেইলে পাঠানো লিংকে ক্লিক করে নিশ্চিত করুন, তারপর লগইন করুন।",
    chats: "চ্যাট",
    partners: "পার্টনার",
    profile: "প্রোফাইল",
    online: "অনলাইন",
    offline: "অফলাইন",
    noPartners: "এখনো কোনো পার্টনার নেই। তাদের DuoX কোড দিয়ে যোগ করুন।",
    noOwner: "এখনো যুক্ত হননি। আপনার কোডটি ওনারকে দিন।",
    yourCode: "আপনার DuoX কোড",
    addPartner: "পার্টনার যোগ করুন",
    partnerCode: "পার্টনারের কোড",
    add: "যোগ",
    remove: "বাদ দিন",
    removeConfirm: "এই পার্টনারকে বাদ দেবেন? তাদের চ্যাট মুছে যাবে।",
    added: "পার্টনার যোগ হয়েছে",
    removed: "পার্টনার বাদ দেওয়া হয়েছে",
    owner: "ওনার",
    partner: "পার্টনার",
    role: "ভূমিকা",
    language: "ভাষা",
    logout: "লগআউট",
    save: "সেভ",
    saved: "সেভ হয়েছে",
    typeMessage: "মেসেজ লিখুন",
    noMessages: "হ্যালো বলুন 👋",
    sent: "পাঠানো হয়েছে",
    download: "ডাউনলোড",
    open: "খুলুন",
    callsSoon: "কল ফিচার পরের আপডেটে আসছে।",
    adFree: "১০০% বিজ্ঞাপনমুক্ত",
    since: "পার্টনার হয়েছেন",
  },
} as const;

export type Lang = keyof typeof dict;
type Key = keyof (typeof dict)["en"];

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict.en[k],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("fp-lang");
    if (saved === "bn" || saved === "en") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("fp-lang", l);
  };
  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[lang][k] }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
