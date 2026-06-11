import type { Metadata } from 'next'
import { insights } from '@/data/insights'
import NewsletterForm from '@/components/newsletter-form'

export const metadata: Metadata = {
  title: 'Insights | A96 Ventures',
  description: 'What we\'re thinking about.',
}

export default function Insights() {
  return (
    <div className="py-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Insights
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            What we&apos;re thinking about.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {insights.map((insight, index) => (
            <article 
              key={index} 
              className="bg-white border border-gray-300 rounded-xl p-8 transition-all duration-200 ease-[var(--ease-out)] @media(hover:hover):hover:-translate-y-1 @media(hover:hover):hover:shadow-[0_8px_32px_rgba(0,0,0,0.1)] opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium tracking-wide">
                  {insight.category}
                </span>
                <span className="text-sm text-gray-500">{insight.date}</span>
              </div>
              <h3 className="text-xl font-semibold text-black mb-4 leading-snug">
                {insight.title}
              </h3>
              <p className="text-gray-500 leading-relaxed mb-6">
                {insight.excerpt}
              </p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{insight.readTime}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="text-center bg-gray-100 py-16 px-6 md:px-10 rounded-xl">
          <h2 className="text-3xl font-semibold text-black mb-4">Stay Updated</h2>
          <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
            Subscribe to our newsletter for the latest insights and market analysis.
          </p>
          <NewsletterForm />
        </div>
      </div>
    </div>
  )
}
