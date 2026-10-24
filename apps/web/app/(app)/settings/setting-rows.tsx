"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@konkyo/ui/components/select"
import { Switch } from "@konkyo/ui/components/switch"

/** One setting that's on or off: the words on the left, a switch on the right (never a checkbox). */
export function SwitchRow({
  id,
  title,
  about,
  checked,
  disabled,
  onChange,
}: {
  id: string
  title: string
  about: string
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="setting-row is-switch">
      <label htmlFor={id} className="setting-text">
        <strong>{title}</strong>
        <span>{about}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(on) => onChange(Boolean(on))}
        className="setting-switch"
      />
    </div>
  )
}

/** One setting chosen from a list: a real select, its label showing the choice. */
export function SelectRow({
  title,
  about,
  value,
  options,
  disabled,
  onChange,
  children,
}: {
  title: string
  about: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
  /** Anything that sits beside the select (a ▶ to hear a voice). */
  children?: React.ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <strong>{title}</strong>
        <span>{about}</span>
      </div>
      <div className="setting-control">
        {children}
        <Select
          items={options}
          value={value}
          disabled={disabled}
          onValueChange={(next) => next !== null && onChange(String(next))}
        >
          <SelectTrigger className="setting-select" aria-label={title}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
