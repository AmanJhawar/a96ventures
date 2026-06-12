"use client"

import { useState, useEffect } from 'react'
import { getTeamMembers } from '@/lib/firebase/db'
import { TeamMember } from '@/lib/types'

export default function TeamClient() {
  const [teamMembers, setTeamMembers] = useState<(TeamMember & {id: string})[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTeam() {
      try {
        const data = await getTeamMembers()
        setTeamMembers(data)
      } catch (error) {
        console.error("Failed to load team members:", error)
      } finally {
        setLoading(false)
      }
    }
    loadTeam()
  }, [])

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Our Team
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            Investors and operators who build alongside founders.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No team members found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 mb-20">
            {teamMembers.map((member, index) => (
              <div 
                key={member.id} 
                className="bg-white border border-gray-300 rounded-xl p-8 text-center transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.1)] opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div>
                  <h3 className="text-2xl font-semibold text-black mb-2">{member.name}</h3>
                  <div className="text-base font-medium text-gray-500 mb-5 tracking-wide">{member.role}</div>
                  <p className="text-gray-500 leading-relaxed mb-6">{member.bio}</p>
                  <div>
                    <div className="text-sm font-semibold text-black mb-3">Expertise:</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {member.expertise.map((skill, skillIndex) => (
                        <span 
                          key={skillIndex} 
                          className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium tracking-wide"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center max-w-[800px] mx-auto">
          <h2 className="text-3xl font-semibold text-black mb-6">Our Investment Philosophy</h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            We believe in backing exceptional founders who are solving meaningful problems with innovative solutions. 
            Our team combines deep industry expertise with operational experience to provide strategic value beyond capital.
          </p>
        </div>
      </div>
    </div>
  )
}
