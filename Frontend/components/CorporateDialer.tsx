"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Phone, PhoneOff, Delete, Users, Clock, Signal, Smartphone } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CallInfo {
  callId: string
  number: string
  state: "dialing" | "active" | "ringing" | "held" | "disconnected"
}

interface CorporateDialerProps {
  deviceName: string
  selectedSim: {
    id: string
    name: string
    operator: string
    type: "physical" | "esim"
  }
  activeCalls?: CallInfo[]
  onMakeCall: (number: string) => void
  onEndCall: (callId: string) => void
  onMergeActiveCalls: () => void
  deviceModel: string
  campaignStatus?: {
    isActive: boolean
    currentNumber?: string
    totalNumbers?: number
    completedCalls?: number
  }
}

export function CorporateDialer({
  deviceName,
  selectedSim,
  activeCalls = [],
  onMakeCall,
  onEndCall,
  onMergeActiveCalls,
  deviceModel,
  campaignStatus,
}: CorporateDialerProps) {
  const { toast } = useToast()
  const [phoneNumber, setPhoneNumber] = useState("")

  const dialpadNumbers = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ]

  const handleNumberPress = (number: string) => {
    setPhoneNumber((prev) => prev + number)
  }

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1))
  }

  const handleCall = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Número necessário",
        description: "Digite um número para fazer a chamada",
        variant: "destructive",
      })
      return
    }

    onMakeCall(phoneNumber)
    setPhoneNumber("")
  }

  const handleEndAllCalls = () => {
    activeCalls.forEach((call) => onEndCall(call.callId))
  }

  const hasActiveCalls = activeCalls.length > 0
  const isInCampaign = campaignStatus?.isActive

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 pb-safe">
      <div className="max-w-md mx-auto space-y-4">
        <Card className="border-0 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm font-medium opacity-90">Conectado</span>
                  </div>
                  <h2 className="text-lg font-semibold">{deviceName}</h2>
                </div>
              </div>
              <Signal className="w-5 h-5 opacity-80" />
            </div>

            <div className="flex items-center gap-2 text-sm bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
              <span className="text-lg">{selectedSim.type === "physical" ? "📱" : "📶"}</span>
              <span className="font-medium">{selectedSim.name}</span>
              <span className="opacity-60">•</span>
              <span className="opacity-90">{selectedSim.operator}</span>
            </div>
          </CardContent>
        </Card>

        {isInCampaign && (
          <Card className="border-0 bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-1">Campanha Ativa</h3>
                  {campaignStatus?.currentNumber && (
                    <p className="text-sm opacity-95 mb-2 font-medium">Ligando para: {campaignStatus.currentNumber}</p>
                  )}
                  {campaignStatus?.totalNumbers && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-500"
                          style={{
                            width: `${((campaignStatus.completedCalls || 0) / campaignStatus.totalNumbers) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap">
                        {campaignStatus.completedCalls || 0} de {campaignStatus.totalNumbers}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeCalls.length > 0 && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Chamadas Ativas ({activeCalls.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {activeCalls.map((call) => (
                    <div
                      key={call.callId}
                      className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{call.number}</p>
                        <p className="text-xs text-gray-600 flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              call.state === "active"
                                ? "bg-green-500 animate-pulse"
                                : call.state === "dialing"
                                  ? "bg-blue-500 animate-pulse"
                                  : call.state === "ringing"
                                    ? "bg-yellow-500 animate-pulse"
                                    : "bg-gray-400"
                            }`}
                          />
                          {call.state === "dialing"
                            ? "Discando..."
                            : call.state === "active"
                              ? "Conectada"
                              : call.state === "ringing"
                                ? "Tocando"
                                : call.state === "held"
                                  ? "Em espera"
                                  : call.state}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEndCall(call.callId)}
                        className="h-9 w-9 p-0 rounded-full bg-red-500 hover:bg-red-600 text-white"
                      >
                        <PhoneOff className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 pt-2">
                {activeCalls.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onMergeActiveCalls}
                    className="flex-1 border-blue-200 hover:bg-blue-50 bg-transparent"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Conferência
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEndAllCalls}
                  className="flex-1 border-red-200 hover:bg-red-50 text-red-600 bg-transparent"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Encerrar Todas
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardContent className="p-6 space-y-6">
            <div className="relative">
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Digite o número"
                className="text-center text-2xl font-light h-16 border-0 bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
                type="tel"
              />
              {phoneNumber && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleBackspace}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 rounded-full hover:bg-gray-200"
                >
                  <Delete className="w-5 h-5" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {dialpadNumbers.flat().map((number) => (
                <Button
                  key={number}
                  onClick={() => handleNumberPress(number)}
                  variant="ghost"
                  className="h-16 text-2xl font-light rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 hover:from-blue-50 hover:to-indigo-50 border border-gray-200 hover:border-blue-300 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                >
                  {number}
                </Button>
              ))}
            </div>

            <div className="pt-2">
              {hasActiveCalls || isInCampaign ? (
                <Button
                  onClick={handleEndAllCalls}
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-95"
                >
                  <PhoneOff className="w-6 h-6 mr-2" />
                  Encerrar Chamada
                </Button>
              ) : (
                <Button
                  onClick={handleCall}
                  disabled={!phoneNumber.trim()}
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Phone className="w-6 h-6 mr-2" />
                  Ligar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center space-y-1 pb-4">
          <p className="text-sm font-medium text-gray-700">{deviceModel}</p>
          <p className="text-xs text-gray-500">Aguardando comandos do dashboard...</p>
        </div>
      </div>
    </div>
  )
}
