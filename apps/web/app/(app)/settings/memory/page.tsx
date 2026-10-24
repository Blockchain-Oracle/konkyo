import { redirect } from "next/navigation"

/** Memory moved to what Konkyo knows (plan F51), where it sits beside everything else it knows. */
export default function MemoryPage() {
  redirect("/knows")
}
