"use client"
import { Plus } from 'lucide-react'
import React from 'react'
import { ActionTooltip } from '../action-tooltip'
import { useModal } from '@/hooks/use-modal-store'

const NavigationAction = () => {
  const {onOpen}=useModal();
  return (
    <div>
      <ActionTooltip
      side="right"
      align="center"
      label="Create a space"
      >
      <button 
      onClick={()=>onOpen("createServer")}
      className='group flex items-center' >
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[14px] border border-dashed border-black/20 bg-black/[0.035] transition group-hover:border-[#7567ff]/55 group-hover:bg-[#7567ff] dark:border-white/20 dark:bg-white/[0.055] dark:group-hover:border-[#8a7fff]/60">
          <Plus
          className="text-black/45 transition group-hover:rotate-90 group-hover:text-white dark:text-white/50"
          size={20}
          />
        </div>
      </button>
      </ActionTooltip>
    
    </div>
  )
}

export default NavigationAction
