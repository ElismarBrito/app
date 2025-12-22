import { useState, useEffect } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  console.log('useAuth - Current user:', user)
  console.log('useAuth - Loading:', loading)

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setSession(session)
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setSession(session)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ... (keep signIn, signUp, signOut methods same as before, I will use ReplaceFileContent on the whole file or huge chunk if easiest, or just specific lines)

  // Actually, replace_file_content for the whole file is risky if I miss lines. 
  // I will use replace_file_content for the top part and the return part.

  // WAIT. I can just rewrite the top part and the return part using multi_replace.


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
    session,
    loading,
    signIn,
    signUp,
    signOut
  }
}