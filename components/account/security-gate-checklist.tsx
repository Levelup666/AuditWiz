import { CircleCheck, Circle } from 'lucide-react'

type SecurityGateChecklistProps = {
  passwordOk: boolean
  rotationOk: boolean
  passwordExpired: boolean
}

export default function SecurityGateChecklist({
  passwordOk,
  rotationOk,
  passwordExpired,
}: SecurityGateChecklistProps) {
  const steps = [
    {
      id: 'password',
      label: passwordExpired ? 'Set a new password' : 'Confirm your password',
      done: passwordOk,
    },
    {
      id: 'rotation',
      label: 'Choose your password change interval',
      done: rotationOk,
    },
  ]

  return (
    <ol className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
      <p className="font-medium text-foreground">Before you continue</p>
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-2 text-muted-foreground">
          {step.done ? (
            <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className={step.done ? 'text-foreground' : undefined}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}
