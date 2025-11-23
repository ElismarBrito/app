"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Phone, PhoneOff, Delete, Users, Clock, Signal, Smartphone, Play, Pause, Square } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { CallInfo, CampaignProgress } from "@/plugins/pbx-mobile"

interface ModernDialerProps {
  deviceName: string
  selectedSim: {
    id: string
    name: string
    operator: string
    type: "physical" | "esim"
  }
  activeCalls: CallInfo[]
  onMakeCall: (number: string) => void
  onEndCall: (callId: string) => void
  onMergeActiveCalls: () => void
  deviceModel: string
  campaignProgress: CampaignProgress | null
  campaignName: string
  onPauseCampaign: () => void
  onResumeCampaign: () => void
  onStopCampaign: () => void
}

export function ModernDialer({
  deviceName,
  selectedSim,
  activeCalls,
  onMakeCall,
  onEndCall,
  onMergeActiveCalls,
  deviceModel,
  campaignProgress,
  campaignName,
  onPauseCampaign,
  onResumeCampaign,
  onStopCampaign,
}: ModernDialerProps) {
  const { toast } = useToast()
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isCampaignPaused, setIsCampaignPaused] = useState(false)

  // Monitora mudanças em activeCalls para garantir renderização
  useEffect(() => {
    if (activeCalls.length > 0) {
      console.log("📱 ModernDialer - Chamadas ativas:", activeCalls.length)
    }
  }, [activeCalls])

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

  const handlePause = () => {
    onPauseCampaign()
    setIsCampaignPaused(true)
  }

  const handleResume = () => {
    onResumeCampaign()
    setIsCampaignPaused(false)
  }

  const hasActiveCalls = activeCalls.length > 0
  const isInCampaign = !!campaignProgress

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 pb-safe">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header moderno */}
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

        {/* Status da Campanha */}
        {isInCampaign && campaignProgress && (
          <Card className="border-0 bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-1">Campanha Ativa</h3>
                  <p className="text-sm opacity-95 mb-2 font-medium">Lista: {campaignName}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-500"
                        style={{
                          width: `${campaignProgress.progressPercentage}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">
                      {campaignProgress.completedNumbers} de {campaignProgress.totalNumbers}
                    </span>
                  </div>

                  {/* Ligações em andamento */}
                  {campaignProgress.dialingNumbers && campaignProgress.dialingNumbers.length > 0 && (
                    <div className="space-y-1 mb-3">
                      <p className="text-xs font-medium opacity-90 mb-1">Ligando para:</p>
                      <div className="flex flex-wrap gap-1">
                        {campaignProgress.dialingNumbers.map((num) => (
                          <Badge key={num} variant="secondary" className="bg-white/20 text-white border-0 animate-pulse">
                            {num}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {isCampaignPaused ? (
                      <Button onClick={handleResume} size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-md focus-visible:outline-none focus-visible:ring-0">
                        <Play className="h-4 w-4 mr-2" />
                        Retomar
                      </Button>
                    ) : (
                      <Button onClick={handlePause} size="sm" className="flex-1 bg-white/30 hover:bg-white/40 text-white border border-white/40 shadow-md focus-visible:outline-none focus-visible:ring-0">
                        <Pause className="h-4 w-4 mr-2" />
                        Pausar
                      </Button>
                    )}
                    <Button onClick={onStopCampaign} size="sm" className="flex-1 bg-red-600/80 hover:bg-red-700/90 text-white border border-white/40 shadow-md focus-visible:outline-none focus-visible:ring-0">
                      <Square className="h-4 w-4 mr-2" />
                      Parar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chamadas Ativas */}
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
                  {activeCalls
                    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                    .map((call) => (
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
                          className="h-9 w-9 p-0 rounded-full bg-red-500 hover:bg-red-600 text-white focus-visible:outline-none focus-visible:ring-0"
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
                    size="sm"
                    onClick={onMergeActiveCalls}
                    className="flex-1 border-2 border-blue-500 hover:bg-blue-500 bg-white hover:text-white text-blue-600 shadow-md focus-visible:outline-none focus-visible:ring-0"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Conferência
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleEndAllCalls}
                  className="flex-1 border-2 border-red-500 hover:bg-red-500 bg-white hover:text-white text-red-600 shadow-md focus-visible:outline-none focus-visible:ring-0"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Encerrar Todas
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campo de entrada e teclado numérico */}
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardContent className="p-6 space-y-6">
            <div className="relative">
              <Input
                value={phoneNumber}
                readOnly
                inputMode="none"
                onFocus={(e) => e.target.blur()}
                placeholder="Digite o número"
                className="text-center text-2xl font-semibold h-16 border border-gray-200 bg-white text-gray-900 focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none focus-visible:border-transparent rounded-xl cursor-default shadow-sm"
                type="tel"
              />
              {phoneNumber && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleBackspace}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0 rounded-full bg-gray-800 hover:bg-gray-900 text-white shadow-md"
                >
                  <Delete className="w-5 h-5" />
                </Button>
              )}
            </div>

            {/* Teclado numérico moderno */}
            <div className="grid grid-cols-3 gap-3">
              {dialpadNumbers.flat().map((number) => (
                <Button
                  key={number}
                  onClick={() => handleNumberPress(number)}
                  variant="ghost"
                  className="h-16 text-2xl font-light !text-gray-900 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 transition-all duration-200 active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-0"
                >
                  {number}
                </Button>
              ))}
            </div>

            {/* Botão de ação principal */}
            <div className="pt-2">
              {hasActiveCalls || isInCampaign ? (
                <Button
                  onClick={handleEndAllCalls}
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-0"
                >
                  <PhoneOff className="w-6 h-6 mr-2" />
                  Encerrar Chamada
                </Button>
              ) : (
                <Button
                  onClick={handleCall}
                  disabled={!phoneNumber.trim()}
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-0"
                >
                  <Phone className="w-6 h-6 mr-2" />
                  Ligar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-1 pb-4">
          <p className="text-sm font-medium text-gray-700">{deviceModel}</p>
          <p className="text-xs text-gray-500">Aguardando comandos do dashboard...</p>
        </div>
      </div>
    </div>
  )
}


