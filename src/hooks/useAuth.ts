import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  
  console.log('useAuth - Current user:', user)
  console.log('useAuth - Loading:', loading)

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      console.log('signIn - Attempting login with:', { email })
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      console.log('signIn - Response:', { data, error })
      if (error) throw error

      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao PBX Dashboard"
      })

      return { data, error: null }
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive"
      })
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true)
      console.log('signUp - Attempting signup with:', { email })
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      })

      console.log('signUp - Response:', { data, error })
      if (error) throw error

      toast({
        title: "Conta criada com sucesso!",
        description: "Verifique seu email para confirmar a conta"
      })

      return { data, error: null }
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive"
      })
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) throw error

      toast({
        title: "Logout realizado",
        description: "Até logo!"
      })
    } catch (error: any) {
      toast({
        title: "Erro no logout",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut
  }
}