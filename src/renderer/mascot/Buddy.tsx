import { useAppState } from '@/lib/app-state'
import { Mascot, type MascotProps } from './Mascot'
import type { MascotAccessory, MascotColour } from './options'

/** The mascot in the colour and accessory this profile picked. */
export function Buddy(props: Omit<MascotProps, 'colour' | 'accessory'>) {
  const { meta } = useAppState()
  return (
    <Mascot
      colour={(meta?.avatarColour ?? 'ink') as MascotColour}
      accessory={(meta?.avatarAccessory ?? 'none') as MascotAccessory}
      {...props}
    />
  )
}
