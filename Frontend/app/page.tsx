"use client"

import { CorporateDialer } from "@/components/CorporateDialer"
import { useState } from "react"

export default function Page() {
  const [activeCalls, setActiveCalls] = useState<any[]>([])

  // Mock handlers para demonstração
  const handleMakeCall = (number: string) => {
    console.log("[v0] Fazendo chamada para:", number)
    const newCall = {
      callId: `call-${Date.now()}`,
      number,
      state: "dialing" as const,
    }
    setActiveCalls((prev) => [...prev, newCall])

    // Simula mudança de estado após 2 segundos
    setTimeout(() => {
      setActiveCalls((prev) =>
        prev.map((call) => (call.callId === newCall.callId ? { ...call, state: "active" as const } : call)),
      )
    }, 2000)
  }

  const handleEndCall = (callId: string) => {
    console.log("[v0] Encerrando chamada:", callId)
    setActiveCalls((prev) => prev.filter((call) => call.callId !== callId))
  }

  const handleMergeActiveCalls = () => {
    console.log("[v0] Mesclando chamadas ativas")
  }

  return (
    <CorporateDialer
      deviceName="Smartphone"
      selectedSim={{
        id: "sim-1",
        name: "SIM Principal",
        operator: "Operadora 1",
        type: "physical",
      }}
      activeCalls={activeCalls}
      onMakeCall={handleMakeCall}
      onEndCall={handleEndCall}
      onMergeActiveCalls={handleMergeActiveCalls}
      deviceModel="Samsung Galaxy S21"
      campaignStatus={{
        isActive: false,
      }}
    />
  )
}
