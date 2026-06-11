'use client'

import { useState } from 'react'

export default function NewsletterForm() {
  const [email, setEmail] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Email submitted:', email)
    setEmail('')
  }

  return (
    <form className="flex flex-col sm:flex-row max-w-[500px] mx-auto gap-4" onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Enter your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 px-6 py-4 border border-gray-300 rounded-full text-base bg-white transition-all duration-150 ease-[var(--ease)] focus:border-black focus:ring-4 focus:ring-black/10 outline-none"
        required
      />
      <button 
        type="submit" 
        className="px-8 py-4 bg-black text-white rounded-full text-base font-semibold transition-all duration-150 ease-[var(--ease-out)] @media(hover:hover):hover:bg-gray-700 active:scale-[0.97] active:blur-[0.5px] whitespace-nowrap"
      >
        Subscribe
      </button>
    </form>
  )
}
