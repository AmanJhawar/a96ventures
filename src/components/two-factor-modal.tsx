"use client"

import { useState } from 'react'
import {
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  User,
  MultiFactorInfo
} from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { ShieldCheck, ShieldAlert, X, Check, Lock, Smartphone, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { toast } from 'sonner'

interface TwoFactorModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
}

export function TwoFactorModal({ isOpen, onClose, user }: TwoFactorModalProps) {
  if (!isOpen || !user) return null

  return <TwoFactorModalDialog key={user.uid} onClose={onClose} user={user} />
}

function TwoFactorModalDialog({ onClose, user }: { onClose: () => void; user: User }) {
  const shouldReduceMotion = useReducedMotion()
  const [enrolledFactors, setEnrolledFactors] = useState<MultiFactorInfo[]>(() => {
    try {
      return multiFactor(user).enrolledFactors || []
    } catch {
      return []
    }
  })
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '+91 ')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [isUnenrolling, setIsUnenrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refresh enrolled factors list
  const refreshFactors = () => {
    try {
      const factors = multiFactor(user).enrolledFactors
      setEnrolledFactors(factors || [])
    } catch (e) {
      console.warn('Could not read enrolled factors:', e)
    }
  }

  const handleSendCode = async () => {
    if (!user) return
    setError(null)

    const cleanPhone = phoneNumber.trim()
    if (!cleanPhone.startsWith('+') || cleanPhone.length < 10) {
      setError('Please enter a valid phone number with country code (e.g. +91 9876543210)')
      return
    }

    setIsSendingCode(true)
    try {
      const session = await multiFactor(user).getSession()
      
      // Cleanup any previous recaptcha
      const existingVerifier = (window as unknown as { recaptchaVerifier?: RecaptchaVerifier }).recaptchaVerifier
      if (existingVerifier) {
        try {
          existingVerifier.clear()
        } catch {
          // ignore
        }
      }

      const verifier = new RecaptchaVerifier(auth, 'two-factor-recaptcha-container', {
        size: 'invisible'
      })
      ;(window as unknown as { recaptchaVerifier?: RecaptchaVerifier }).recaptchaVerifier = verifier

      const phoneProvider = new PhoneAuthProvider(auth)
      const vId = await phoneProvider.verifyPhoneNumber(
        {
          phoneNumber: cleanPhone,
          session
        },
        verifier
      )

      setVerificationId(vId)
      toast.success(`Verification code sent to ${cleanPhone}`)
    } catch (err: unknown) {
      console.error('Error sending MFA verification code:', err)
      const msg = err instanceof Error ? err.message : 'Failed to send SMS verification code'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleEnroll = async () => {
    if (!user || !verificationId) return
    setError(null)

    const cleanCode = verificationCode.trim()
    if (cleanCode.length < 6) {
      setError('Please enter the 6-digit code received via SMS')
      return
    }

    setIsEnrolling(true)
    try {
      const cred = PhoneAuthProvider.credential(verificationId, cleanCode)
      const assertion = PhoneMultiFactorGenerator.assertion(cred)
      await multiFactor(user).enroll(assertion, 'Primary Mobile Device')
      
      toast.success('Two-step verification activated successfully!')
      refreshFactors()
      setVerificationId(null)
      setVerificationCode('')
    } catch (err: unknown) {
      console.error('Error enrolling multi-factor:', err)
      const msg = err instanceof Error ? err.message : 'Invalid verification code'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsEnrolling(false)
    }
  }

  const handleUnenroll = async (factor: MultiFactorInfo) => {
    if (!user) return
    setIsUnenrolling(true)
    setError(null)
    try {
      await multiFactor(user).unenroll(factor)
      toast.success('Two-step verification removed.')
      refreshFactors()
    } catch (err: unknown) {
      console.error('Error unenrolling multi-factor:', err)
      const msg = err instanceof Error ? err.message : 'Failed to remove two-step verification'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsUnenrolling(false)
    }
  }

  const isEnrolled = enrolledFactors.length > 0

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, transform: shouldReduceMotion ? 'none' : 'scale(0.97) translateY(8px)' }}
          animate={{ opacity: 1, transform: shouldReduceMotion ? 'none' : 'scale(1) translateY(0px)' }}
          exit={{ opacity: 0, transform: shouldReduceMotion ? 'none' : 'scale(0.97) translateY(8px)' }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
                {isEnrolled ? <ShieldCheck size={20} /> : <Lock size={20} />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-black tracking-tight">Two-Factor Authentication</h2>
                <p className="text-xs text-gray-500">Protect your account with SMS verification codes.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          {/* Invisible recaptcha anchor */}
          <div id="two-factor-recaptcha-container" />

          {/* Content */}
          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3.5 bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl flex items-center gap-2.5">
                <AlertCircle size={15} className="text-gray-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isEnrolled ? (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-black flex items-center gap-1.5">
                        Two-Step Verification is Active
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-black text-white">
                          Protected
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {enrolledFactors[0]?.displayName || 'SMS Security Check'} (Enrolled)
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnenroll(enrolledFactors[0])}
                    disabled={isUnenrolling}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-black border border-gray-200 hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] active:scale-[0.97] disabled:opacity-50"
                  >
                    {isUnenrolling ? 'Removing...' : 'Turn Off'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Every sign in for this account requires your password and a one-time verification code sent to your registered device.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <div className="text-xs font-bold text-black flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-gray-600" />
                    Two-Step Verification is Disabled
                  </div>
                  <p className="text-xs text-gray-500">
                    Staff handling physical inventory, purchases, adjustments, and cash registers should enable two-step login to prevent unauthorized vault access.
                  </p>
                </div>

                {!verificationId ? (
                  <div className="space-y-3 pt-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Mobile Phone Number (E.164 format with country code)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="flex-1 px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color]"
                      />
                      <button
                        onClick={handleSendCode}
                        disabled={isSendingCode}
                        className="h-10 px-4 bg-black text-white hover:bg-gray-800 disabled:opacity-50 rounded-lg text-xs font-semibold transition-[background-color,transform] active:scale-[0.97] whitespace-nowrap"
                      >
                        {isSendingCode ? 'Sending...' : 'Send SMS Code'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                        Enter 6-Digit SMS Verification Code
                      </label>
                      <button
                        onClick={() => setVerificationId(null)}
                        className="text-xs text-gray-500 hover:text-black font-semibold"
                      >
                        Change number
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="123456"
                        className="flex-1 px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-mono tracking-widest text-center text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color]"
                      />
                      <button
                        onClick={handleEnroll}
                        disabled={isEnrolling}
                        className="h-10 px-5 bg-black text-white hover:bg-gray-800 disabled:opacity-50 rounded-lg text-xs font-semibold transition-[background-color,transform] active:scale-[0.97] whitespace-nowrap flex items-center gap-1.5"
                      >
                        <Check size={14} />
                        {isEnrolling ? 'Activating...' : 'Activate 2-Step Login'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-xs font-semibold text-black rounded-lg transition-[background-color,transform] active:scale-[0.97]"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
