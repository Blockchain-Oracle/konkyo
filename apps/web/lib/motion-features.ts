// Motion's animation features, loaded after the first render (motion.dev "Reduce bundle size"):
// the app animates with `m` components, which need these, so they stay out of every page's
// first download. domMax: shared-layout (layoutId) animations, such as the sliding segmented pill.
import { domMax } from "motion/react"

export default domMax
