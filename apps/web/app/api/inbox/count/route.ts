import { route } from "@/lib/api"
import { unreadCount } from "@/lib/inbox"

/** The unread count beside Inbox in the sidebar and the tab bar. */
export const GET = route(async ({ userId }) => ({ unread: await unreadCount(userId) }))
