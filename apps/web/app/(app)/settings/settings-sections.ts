import {
  BellIcon,
  BrainIcon,
  GaugeIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LogOutIcon,
  type LucideIcon,
  PlugIcon,
  QuoteIcon,
  TelescopeIcon,
  UserRoundIcon,
  Volume2Icon,
} from "lucide-react"

export type SettingsSection = {
  id: string
  label: string
  icon: LucideIcon
  /** One line under the title, for sections whose body doesn't already say what it is. */
  about?: string
}

/**
 * Everything on the Settings page, in the order it appears, in four groups: who you are, how
 * Konkyo behaves for you, what it's connected to, and your account. The nav and the page both
 * read this, so a section can't be in one and missing from the other.
 */
export const SETTINGS_GROUPS: { label: string; sections: SettingsSection[] }[] = [
  {
    label: "You",
    sections: [
      {
        id: "you",
        label: "you",
        icon: UserRoundIcon,
        about: "Your face, your name, and the page others can visit.",
      },
    ],
  },
  {
    label: "How it works for you",
    sections: [
      {
        id: "sounds",
        label: "sounds & voice",
        icon: Volume2Icon,
        about: "Interface sounds, and the voices that read to you.",
      },
      {
        id: "citations",
        label: "citations",
        icon: QuoteIcon,
        about: "How sources are written when you export.",
      },
      {
        id: "deep-search",
        label: "deep search",
        icon: TelescopeIcon,
        about: "What happens to the sources a deep search finds.",
      },
      {
        id: "study",
        label: "study",
        icon: GraduationCapIcon,
        about: "How much new practice each day brings.",
      },
      {
        id: "notifications",
        label: "notifications",
        icon: BellIcon,
        about: "Reminders and finished agent runs.",
      },
    ],
  },
  {
    label: "Connected",
    sections: [
      {
        id: "connectors",
        label: "connectors",
        icon: PlugIcon,
        about: "Bring in what you already keep in Gmail, Drive and Notion.",
      },
      { id: "memory", label: "memory", icon: BrainIcon, about: "What Konkyo remembers about you." },
    ],
  },
  {
    label: "Account",
    sections: [
      { id: "api-keys", label: "API keys", icon: KeyRoundIcon },
      { id: "usage", label: "usage", icon: GaugeIcon },
      { id: "leave", label: "sign out & delete", icon: LogOutIcon },
    ],
  },
]

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap((group) => group.sections)
