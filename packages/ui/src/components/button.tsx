import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cn } from "@konkyo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  // The sticker buttons: pills that lift on hover and press down on click.
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[translate,box-shadow,background-color,color,border-color,opacity] duration-(--dur-quick) ease-(--ease-glide) outline-none select-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* The one lime action per view, black text. */
        default:
          "bg-primary font-bold text-primary-foreground hover:-translate-y-0.5 hover:shadow-[0_4px_0_rgb(201_255_61/0.24)]",
        /* Black sticker pill: the house chrome button. */
        sticker:
          "bg-sticker text-white shadow-sticker hover:-translate-y-0.5 hover:shadow-sticker-lift aria-expanded:bg-black",
        /* White pill (marketing calls to action, the voice stage's finish key). */
        white: "bg-white font-bold text-ink hover:-translate-y-0.5 hover:shadow-sticker",
        outline:
          "border-white/18 bg-transparent text-foreground hover:bg-white/8 aria-expanded:bg-white/8",
        secondary: "bg-sticker text-white hover:bg-black aria-expanded:bg-black",
        ghost:
          "text-room-soft hover:bg-white/8 hover:text-white aria-expanded:bg-white/8 aria-expanded:text-white",
        destructive:
          "bg-destructive/15 text-destructive hover:bg-destructive/25 focus-visible:ring-destructive/40",
        link: "text-lime underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
