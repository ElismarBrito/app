import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Verifica se está em modo de desenvolvimento
const isDev = import.meta.env.DEV

/**
 * Log condicional - só executa em desenvolvimento
 * Substitui console.log para não aparecer em produção
 */
export const devLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args)
  }
}

export const devWarn = (...args: unknown[]) => {
  if (isDev) {
    console.warn(...args)
  }
}

export const devError = (...args: unknown[]) => {
  if (isDev) {
    console.error(...args)
  }
}
