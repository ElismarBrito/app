import { createClient } from '@supabase/supabase-js'

// Using Lovable's native Supabase integration
export const supabase = createClient(
  'https://placeholder.supabase.co', // This will be replaced by Lovable's integration
  'placeholder-key' // This will be replaced by Lovable's integration
)

console.log('Supabase client initialized:', {
  url: 'https://placeholder.supabase.co',
  key: 'placeholder-key'
})

// Database Types
export interface Database {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string
          name: string
          status: 'online' | 'offline' | 'unpaired'
          paired_at: string
          last_seen: string | null
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: 'online' | 'offline' | 'unpaired'
          paired_at?: string
          last_seen?: string | null
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          status?: 'online' | 'offline' | 'unpaired'
          paired_at?: string
          last_seen?: string | null
          user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      calls: {
        Row: {
          id: string
          number: string
          status: 'ringing' | 'answered' | 'ended'
          start_time: string
          duration: number | null
          user_id: string
          device_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          number: string
          status?: 'ringing' | 'answered' | 'ended'
          start_time?: string
          duration?: number | null
          user_id: string
          device_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          number?: string
          status?: 'ringing' | 'answered' | 'ended'
          start_time?: string
          duration?: number | null
          user_id?: string
          device_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      number_lists: {
        Row: {
          id: string
          name: string
          numbers: string[]
          is_active: boolean
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          numbers: string[]
          is_active?: boolean
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          numbers?: string[]
          is_active?: boolean
          user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      qr_sessions: {
        Row: {
          id: string
          qr_code: string
          session_link: string
          expires_at: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          qr_code: string
          session_link: string
          expires_at: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          qr_code?: string
          session_link?: string
          expires_at?: string
          user_id?: string
          created_at?: string
        }
      }
    }
  }
}