"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Phone, Mail, Lock, Sparkles } from "lucide-react"

export const AuthForm = () => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const { signIn, signUp, loading } = useAuth()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    await signIn(email, password)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    await signUp(email, password)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <Card className="w-full max-w-md relative backdrop-blur-sm bg-white/95 shadow-2xl border-0">
        <CardHeader className="space-y-4 pb-6">
          {/* Logo and branding */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-lg opacity-50 animate-pulse" />
              <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-2xl">
                <Phone className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              PBX Mobile
            </CardTitle>
            <CardDescription className="text-base text-gray-600">
              Sistema inteligente de gerenciamento de chamadas
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100 p-1 rounded-lg">
              <TabsTrigger
                value="signin"
                className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
              >
                Criar Conta
              </TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-sm font-medium text-gray-700">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-sm font-medium text-gray-700">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Entrar
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="space-y-4">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-gray-700">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-gray-700">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                      required
                      minLength={6}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">A senha deve ter no mínimo 6 caracteres</p>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Criar Conta
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Footer info */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-center text-gray-500">
              Ao continuar, você concorda com nossos termos de uso e política de privacidade
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
