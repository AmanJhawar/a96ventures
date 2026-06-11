import type { Metadata } from 'next'
import { values, milestones } from '@/data/about'

export const metadata: Metadata = {
  title: 'About | A96 Ventures',
  description: 'We are early-stage investors focused on transformative technologies and exceptional founders.',
}

export default function About() {
  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            About
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            We are early-stage investors focused on transformative technologies and exceptional founders.
          </p>
        </div>

        <div className="mb-20">
          <h2 className="text-3xl font-semibold text-black mb-8 text-center">Our Mission</h2>
          <p className="text-lg text-gray-500 leading-relaxed max-w-[800px] mx-auto text-center">
            A96 Ventures partners with visionary entrepreneurs to build tomorrow&apos;s defining companies. 
            We focus on early-stage investments in transformative technologies across enterprise software, 
            healthcare, climate tech, and deep tech sectors. Our approach combines capital with strategic 
            guidance, operational expertise, and a global network to help founders scale their innovations.
          </p>
        </div>

        <div className="mb-20">
          <h2 className="text-3xl font-semibold text-black mb-8 text-center">Our Values</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {values.map((value, index) => (
              <div key={index} className="text-center p-8 border border-gray-300 rounded-xl">
                <h3 className="text-xl font-semibold text-black mb-4">{value.title}</h3>
                <p className="text-gray-500 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-20">
          <h2 className="text-3xl font-semibold text-black mb-8 text-center">Our Journey</h2>
          <div className="max-w-[600px] mx-auto">
            {milestones.map((milestone, index) => (
              <div key={index} className={`flex flex-col md:flex-row gap-2 md:gap-8 mb-8 pb-8 ${index !== milestones.length - 1 ? 'border-b border-gray-300' : ''}`}>
                <div className="text-lg font-semibold text-black min-w-[60px]">{milestone.year}</div>
                <div className="text-gray-500 leading-relaxed">{milestone.event}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-20">
          <h2 className="text-3xl font-semibold text-black mb-8 text-center">Investment Focus</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="text-center p-8 border border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-black mb-4">Enterprise Software</h3>
              <p className="text-gray-500 leading-relaxed">AI-powered solutions, workflow automation, and productivity tools</p>
            </div>
            <div className="text-center p-8 border border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-black mb-4">Healthcare &amp; Biotech</h3>
              <p className="text-gray-500 leading-relaxed">Personalized medicine, medical devices, and digital health platforms</p>
            </div>
            <div className="text-center p-8 border border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-black mb-4">Climate Tech</h3>
              <p className="text-gray-500 leading-relaxed">Carbon capture, renewable energy, and sustainability solutions</p>
            </div>
            <div className="text-center p-8 border border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-black mb-4">Deep Tech</h3>
              <p className="text-gray-500 leading-relaxed">Quantum computing, cybersecurity, and advanced materials</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
