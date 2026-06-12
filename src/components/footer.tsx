import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 mb-16 text-center">
          <div>
            <h3 className="text-sm font-semibold tracking-widest text-black mb-6 uppercase">Company</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">About Us</Link>
              </li>
              <li>
                <Link href="/team" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">Our Team</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold tracking-widest text-black mb-6 uppercase">Portfolio</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/portfolio" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">Companies</Link>
              </li>
              <li>
                <Link href="/brands" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">Our Brands</Link>
              </li>
              <li>
                <Link href="/catalog" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">Catalog</Link>
              </li>
            </ul>
          </div>


          <div>
            <h3 className="text-sm font-semibold tracking-widest text-black mb-6 uppercase">Contact</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-black transition-colors duration-200 ease-[var(--ease-out)] active:opacity-60">Get in Touch</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-200 gap-6 text-center">
          <div className="flex items-center justify-center">
            <Image src="/assets/logo.png" alt="A96 Ventures" width={100} height={30} className="h-8 w-auto object-contain grayscale opacity-50" style={{ width: 'auto' }} />
          </div>
          <div className="text-sm text-gray-500">
            © {currentYear} A96 Ventures. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
