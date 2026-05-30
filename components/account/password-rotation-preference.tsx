'use client'

import { Label } from '@/components/ui/label'
import { ROTATION_OPTIONS, type PasswordRotationDays } from '@/lib/auth/password-policy'

type PasswordRotationPreferenceProps = {
  name?: string
  value: PasswordRotationDays | ''
  onChange: (days: PasswordRotationDays) => void
  required?: boolean
  disabled?: boolean
}

export default function PasswordRotationPreference({
  name = 'password_rotation_days',
  value,
  onChange,
  required = false,
  disabled = false,
}: PasswordRotationPreferenceProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium leading-none">
        Password change interval{required ? ' *' : ''}
      </legend>
      <p className="text-sm text-muted-foreground">
        You will be prompted to choose a new password on this schedule. Pick the interval that works
        for you.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        {ROTATION_OPTIONS.map((days) => (
          <label
            key={days}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name={name}
              value={String(days)}
              checked={value === days}
              required={required && value === ''}
              disabled={disabled}
              onChange={() => onChange(days)}
              className="h-4 w-4 border-input text-primary focus:ring-primary"
            />
            Every {days} days
          </label>
        ))}
      </div>
    </fieldset>
  )
}
